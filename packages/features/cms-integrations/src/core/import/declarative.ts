import { randomBytes } from "node:crypto";
import { DuplicateDashboardError, validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";
import { DuplicateFunctionError, validateFunction, type CmsFunction } from "@bernouy/cms-functions";
import { DuplicateSourceError, sourceDtoToSource, validateSource, type Source } from "@bernouy/cms-sources";
import { parseUrn } from "@bernouy/cms-sources";
import { secretKeyError, secretKeyToRef } from "@bernouy/cms-secrets";
import { IntegrationInputError, IntegrationRuntimeError } from "../errors";
import {
    assertPasswordInputsDeclareSecrets,
    sensitiveInputNames,
} from "../shared/inputSensitivity";
import { resolveTemplate, resolveTemplates, type TemplateContext } from "../templates";
import { writeSecretsWithRollback } from "./secretWrites";
import { buildConnectorDeployments, deployConnectorDeployments } from "./connectorDeployments";
import { writeDashboardsWithRollback, type IntegrationDashboardWrite } from "./dashboardWrites";
import { writeFunctionsWithRollback, type IntegrationFunctionWrite } from "./functionWrites";
import { writeSourcesWithRollback, type IntegrationSourceWrite } from "./sourceWrites";
import type {
    DeclarativeBlocArtifactTemplate,
    DeclarativeGeneratedSecretTemplate,
    DeclarativeSecretTemplate,
    IntegrationDefinition,
} from "../../interfaces/Integration";
import type {
    IntegrationBlocArtifact,
    IntegrationImportDeps,
    IntegrationImportOptions,
    IntegrationImportResult,
} from "../../interfaces/IntegrationImport";

export async function importDeclarativeIntegration(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
    options: IntegrationImportOptions,
): Promise<IntegrationImportResult> {
    const { result } = await executeDeclarativeIntegration(deps, definition, answers, options);
    return result.importResult;
}

export async function importDeclarativeIntegrationWithCommit<T>(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
    options: IntegrationImportOptions,
    commit: (result: IntegrationImportResult) => Promise<T>,
): Promise<{ importResult: IntegrationImportResult; committed: T }> {
    const { result } = await executeDeclarativeIntegration(deps, definition, answers, options, commit);
    if (!("committed" in result)) throw new IntegrationInputError("commit", "missing commit result");
    return result;
}

export function resolveDeclarativeSecretRefs(
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
): Record<string, string> {
    const secretInputNames = sensitiveInputs(definition);
    const inputSecrets = buildInputSecretWrites(definition.secrets ?? [], answers, secretInputNames);
    const generatedSecrets = buildGeneratedSecretWrites(definition.generatedSecrets ?? [], answers, false);
    const writes = [...inputSecrets, ...generatedSecrets];
    assertUniqueSecretWrites(writes);
    return Object.fromEntries(writes.map(secret => [secret.input, secret.key]));
}

export function declarativeSecretBindingNames(definition: IntegrationDefinition): string[] {
    return [
        ...sensitiveInputNames(definition),
        ...(definition.generatedSecrets ?? []).map(secret => secret.name),
    ];
}

async function executeDeclarativeIntegration<T>(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
    options: IntegrationImportOptions,
    commit?: (result: IntegrationImportResult) => Promise<T>,
): Promise<{ result: { importResult: IntegrationImportResult } | { importResult: IntegrationImportResult; committed: T } }> {
    const secretInputNames = sensitiveInputs(definition);
    const inputSecretWrites = buildInputSecretWrites(definition.secrets ?? [], answers, secretInputNames);
    const generatedSecretWrites = buildGeneratedSecretWrites(definition.generatedSecrets ?? [], answers, true);
    const secretWrites = [...inputSecretWrites, ...generatedSecretWrites];
    assertUniqueSecretWrites(secretWrites);
    const baseContext: TemplateContext = {
        answers,
        secrets: Object.fromEntries(secretWrites.map(secret => [secret.input, secretKeyToRef(secret.key)])),
        generated: Object.fromEntries(generatedSecretWrites.map(secret => [secret.input, secret.value])),
        secretInputs: secretInputNames,
    };
    const connectorDeployments = buildConnectorDeployments(definition, {
        ...baseContext,
        connectorSecrets: Object.fromEntries(secretWrites.map(secret => [secret.input, secret.value])),
    });

    return writeSecretsWithRollback(
        deps.secrets,
        secretWrites,
        async (secretResults) => {
            const connectorDeployResult = await deployConnectorDeployments(deps, connectorDeployments, baseContext);
            const context: TemplateContext = {
                ...baseContext,
                connectors: connectorDeployResult.outputs,
            };
            const sourceArtifacts = buildSourceArtifacts(definition, context);
            const sourceWrites = await buildSourceWrites(deps, sourceArtifacts, options);
            const functionArtifacts = buildFunctionArtifacts(definition, context);
            const dashboardArtifacts = buildDashboardArtifacts(definition, context);
            const dashboardWrites = await buildDashboardWrites(deps, dashboardArtifacts, sourceArtifacts, options);
            const blocArtifacts = buildBlocArtifacts(definition, context);

            return writeSourcesWithRollback(deps.sources, sourceWrites, async artifacts => {
                const functionWrites = await buildFunctionWrites(deps, functionArtifacts, options);
                const buildResult = async (functionArtifacts: typeof artifacts, dashboardArtifacts: typeof artifacts) => {
                    const blocImportResults = await importBlocArtifacts(deps, blocArtifacts, options);
                    const importResult = {
                        artifacts: [...artifacts, ...functionArtifacts, ...dashboardArtifacts, ...blocImportResults],
                        ...(secretResults.length ? { secrets: secretResults } : {}),
                        ...(connectorDeployResult.results.length ? { connectors: connectorDeployResult.results } : {}),
                    };
                    return commit
                        ? { importResult, committed: await commit(importResult) }
                        : { importResult };
                };
                const writeDashboards = (functionArtifacts: typeof artifacts) => {
                    if (!dashboardWrites.length) return buildResult(functionArtifacts, []);
                    return writeDashboardsWithRollback(deps.dashboards ?? missingDashboardRepository(), dashboardWrites, dashboardArtifacts =>
                        buildResult(functionArtifacts, dashboardArtifacts));
                };
                if (!functionWrites.length) return writeDashboards([]);
                return writeFunctionsWithRollback(deps.functions ?? missingFunctionRepository(), functionWrites, writeDashboards);
            });
        },
    );
}

function buildSourceArtifacts(definition: IntegrationDefinition, context: TemplateContext): Source[] {
    try {
        return (definition.artifacts ?? [])
            .filter(artifact => artifact.type === "source")
            .map(artifact => sourceDtoToSource(resolveTemplates(artifact.source, context)));
    } catch (error) {
        if (error instanceof IntegrationInputError) throw error;
        throw new IntegrationInputError("artifacts", error instanceof Error ? error.message : "invalid source artifact");
    }
}

function buildFunctionArtifacts(definition: IntegrationDefinition, context: TemplateContext): CmsFunction[] {
    try {
        return (definition.artifacts ?? [])
            .filter(artifact => artifact.type === "function")
            .map(artifact => resolveTemplates(artifact.function, context));
    } catch (error) {
        if (error instanceof IntegrationInputError) throw error;
        throw new IntegrationInputError("artifacts", error instanceof Error ? error.message : "invalid function artifact");
    }
}

function buildDashboardArtifacts(definition: IntegrationDefinition, context: TemplateContext): Dashboard[] {
    try {
        return (definition.artifacts ?? [])
            .filter(artifact => artifact.type === "dashboard")
            .map(artifact => resolveTemplates(artifact.dashboard, context));
    } catch (error) {
        if (error instanceof IntegrationInputError) throw error;
        throw new IntegrationInputError("artifacts", error instanceof Error ? error.message : "invalid dashboard artifact");
    }
}

function buildBlocArtifacts(definition: IntegrationDefinition, context: TemplateContext): IntegrationBlocArtifact[] {
    try {
        return (definition.artifacts ?? [])
            .filter((artifact): artifact is DeclarativeBlocArtifactTemplate => artifact.type === "bloc")
            .map(artifact => {
                const tag = resolveTemplate(artifact.bloc.tag, context);
                const name = resolveTemplate(artifact.bloc.name, context);
                if (!artifact.bloc.viewJS) {
                    throw new IntegrationInputError("artifacts", `bloc "${tag}" is missing viewJS`);
                }
                return {
                    tag,
                    name,
                    ...(artifact.bloc.group ? { group: resolveTemplate(artifact.bloc.group, context) } : {}),
                    ...(artifact.bloc.description ? { description: resolveTemplate(artifact.bloc.description, context) } : {}),
                    viewJS: artifact.bloc.viewJS,
                    ...(artifact.bloc.editorJS !== undefined ? { editorJS: artifact.bloc.editorJS } : {}),
                    ...(artifact.bloc.source ? { source: artifact.bloc.source } : {}),
                };
            });
    } catch (error) {
        if (error instanceof IntegrationInputError) throw error;
        throw new IntegrationInputError("artifacts", error instanceof Error ? error.message : "invalid bloc artifact");
    }
}

async function importBlocArtifacts(
    deps: IntegrationImportDeps,
    artifacts: IntegrationBlocArtifact[],
    options: IntegrationImportOptions,
) {
    if (!artifacts.length) return [];
    if (!deps.blocs) throw new IntegrationRuntimeError("bloc importer not configured");

    const seen = new Set<string>();
    const results = [];
    for (const artifact of artifacts) {
        if (seen.has(artifact.tag)) throw new IntegrationInputError("artifacts", `duplicate bloc artifact "${artifact.tag}"`);
        seen.add(artifact.tag);
        const result = await deps.blocs.importBloc(artifact, options);
        results.push({ type: "bloc" as const, id: result.id, action: result.action });
    }
    return results;
}

function buildInputSecretWrites(
    templates: DeclarativeSecretTemplate[],
    answers: TemplateContext["answers"],
    secretInputNames: ReadonlySet<string>,
): Array<{ input: string; key: string; value: string }> {
    const seenKeys = new Map<string, string>();
    return templates.map(template => {
        if (!secretInputNames.has(template.input)) {
            throw new IntegrationInputError(`secrets.${template.input}`, "must reference a secret input");
        }
        const rawValue = answers[template.input];
        if (typeof rawValue !== "string" || !rawValue) {
            throw new IntegrationInputError(`answers.${template.input}`, "must be a non-empty string secret");
        }
        const key = resolveTemplate(template.key, { answers, secrets: {}, secretInputs: secretInputNames });
        const keyError = secretKeyError(key);
        if (keyError) throw new IntegrationInputError(`secrets.${template.input}.key`, keyError);
        const previousInput = seenKeys.get(key);
        if (previousInput && previousInput !== template.input) {
            throw new IntegrationInputError("secrets", `duplicate resolved secret key "${key}"`);
        }
        seenKeys.set(key, template.input);
        return { input: template.input, key, value: rawValue };
    });
}

function buildGeneratedSecretWrites(
    templates: DeclarativeGeneratedSecretTemplate[],
    answers: TemplateContext["answers"],
    generateValues: boolean,
): Array<{ input: string; key: string; value: string }> {
    const seenNames = new Set<string>();
    const seenKeys = new Set<string>();
    return templates.map(template => {
        if (!template.name) throw new IntegrationInputError("generatedSecrets.name", "is required");
        if (seenNames.has(template.name)) throw new IntegrationInputError("generatedSecrets", `duplicate generated secret "${template.name}"`);
        seenNames.add(template.name);

        const key = resolveTemplate(template.key, { answers, secrets: {}, secretInputs: new Set() });
        const keyError = secretKeyError(key);
        if (keyError) throw new IntegrationInputError(`generatedSecrets.${template.name}.key`, keyError);
        if (seenKeys.has(key)) throw new IntegrationInputError("generatedSecrets", `duplicate resolved secret key "${key}"`);
        seenKeys.add(key);

        return {
            input: template.name,
            key,
            value: generateValues ? generateSecretValue(template) : "__generated__",
        };
    });
}

function assertUniqueSecretWrites(writes: Array<{ input: string; key: string }>): void {
    const names = new Set<string>();
    const keys = new Set<string>();
    for (const write of writes) {
        if (names.has(write.input)) throw new IntegrationInputError("secrets", `duplicate secret binding "${write.input}"`);
        if (keys.has(write.key)) throw new IntegrationInputError("secrets", `duplicate resolved secret key "${write.key}"`);
        names.add(write.input);
        keys.add(write.key);
    }
}

function generateSecretValue(template: DeclarativeGeneratedSecretTemplate): string {
    if (template.generator !== undefined && template.generator !== "token") {
        throw new IntegrationInputError(`generatedSecrets.${template.name}.generator`, "must be token");
    }
    const bytes = template.bytes ?? 32;
    if (!Number.isInteger(bytes) || bytes < 16 || bytes > 64) {
        throw new IntegrationInputError(`generatedSecrets.${template.name}.bytes`, "must be an integer between 16 and 64");
    }
    return `${template.prefix ?? ""}${randomBytes(bytes).toString("base64url")}`;
}

async function buildDashboardWrites(
    deps: IntegrationImportDeps,
    dashboardArtifacts: Dashboard[],
    sourceArtifacts: Source[],
    options: IntegrationImportOptions,
): Promise<IntegrationDashboardWrite[]> {
    if (!dashboardArtifacts.length) return [];
    if (!deps.dashboards) throw new IntegrationRuntimeError("dashboard repository not configured");

    const sourceById = new Map(sourceArtifacts.map(source => [sourceId(source), source]));
    const dashboardWrites: IntegrationDashboardWrite[] = [];
    const seen = new Set<string>();

    for (const dashboard of dashboardArtifacts) {
        if (seen.has(dashboard.id)) throw new DuplicateDashboardError(dashboard.id);
        seen.add(dashboard.id);

        const source = sourceById.get(dashboard.source);
        if (!source) {
            throw new IntegrationInputError(
                "artifacts",
                `dashboard "${dashboard.id}" references source "${dashboard.source}" not declared by this integration`,
            );
        }

        const errors = validateDashboard(dashboard, { source });
        if (errors.length) throw new IntegrationInputError("artifacts", errors.join("; "));
        const previous = await deps.dashboards.getDashboard(dashboard.id);
        if (!options.force && previous) {
            throw new DuplicateDashboardError(dashboard.id);
        }
        dashboardWrites.push({ dashboard, previous });
    }

    return dashboardWrites;
}

function sourceId(source: Source): string {
    return parseUrn(source.urn)?.source ?? source.urn;
}

function missingDashboardRepository(): never {
    throw new IntegrationRuntimeError("dashboard repository not configured");
}

function missingFunctionRepository(): never {
    throw new IntegrationRuntimeError("function repository not configured");
}

async function buildFunctionWrites(
    deps: IntegrationImportDeps,
    functionArtifacts: CmsFunction[],
    options: IntegrationImportOptions,
): Promise<IntegrationFunctionWrite[]> {
    if (!functionArtifacts.length) return [];
    if (!deps.functions) throw new IntegrationRuntimeError("function repository not configured");

    const functionWrites: IntegrationFunctionWrite[] = [];
    const seen = new Set<string>();

    for (const fn of functionArtifacts) {
        if (seen.has(fn.id)) throw new DuplicateFunctionError(fn.id);
        seen.add(fn.id);

        const errors = await validateFunction(fn, { sources: deps.sources });
        if (errors.length) throw new IntegrationInputError("artifacts", errors.join("; "));
        const previous = await deps.functions.getFunction(fn.id);
        if (!options.force && previous) throw new DuplicateFunctionError(fn.id);
        functionWrites.push({ fn, previous });
    }

    return functionWrites;
}

async function buildSourceWrites(
    deps: IntegrationImportDeps,
    sourceArtifacts: Source[],
    options: IntegrationImportOptions,
): Promise<IntegrationSourceWrite[]> {
    const sourceWrites: IntegrationSourceWrite[] = [];
    const seen = new Set<string>();

    for (const source of sourceArtifacts) {
        if (seen.has(source.urn)) throw new DuplicateSourceError(source.urn);
        seen.add(source.urn);

        const errors = validateSource(source);
        if (errors.length) throw new IntegrationInputError("artifacts", errors.join("; "));
        const previous = await deps.sources.getSource(source.urn);
        if (!options.force && previous) {
            throw new DuplicateSourceError(source.urn);
        }
        sourceWrites.push({ source, previous });
    }

    return sourceWrites;
}

function sensitiveInputs(definition: IntegrationDefinition): Set<string> {
    assertPasswordInputsDeclareSecrets(definition);
    return new Set(sensitiveInputNames(definition));
}
