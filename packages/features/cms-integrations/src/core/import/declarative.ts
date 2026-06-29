import { DuplicateSourceError, sourceDtoToSource, validateSource, type Source } from "@bernouy/cms-sources";
import { secretKeyError, secretKeyToRef } from "@bernouy/cms-secrets";
import { IntegrationInputError } from "../errors";
import {
    assertPasswordInputsDeclareSecrets,
    sensitiveInputNames,
} from "../shared/inputSensitivity";
import { resolveTemplate, resolveTemplates, type TemplateContext } from "../templates";
import { writeSecretsWithRollback } from "./secretWrites";
import { writeSourcesWithRollback, type IntegrationSourceWrite } from "./sourceWrites";
import type {
    DeclarativeSecretTemplate,
    IntegrationDefinition,
} from "../../interfaces/Integration";
import type {
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
    const secretWrites = buildSecretWrites(definition.secrets ?? [], answers, secretInputNames);
    return Object.fromEntries(secretWrites.map(secret => [secret.input, secret.key]));
}

async function executeDeclarativeIntegration<T>(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
    options: IntegrationImportOptions,
    commit?: (result: IntegrationImportResult) => Promise<T>,
): Promise<{ result: { importResult: IntegrationImportResult } | { importResult: IntegrationImportResult; committed: T } }> {
    const secretInputNames = sensitiveInputs(definition);
    const secretWrites = buildSecretWrites(definition.secrets ?? [], answers, secretInputNames);
    const context: TemplateContext = {
        answers,
        secrets: Object.fromEntries(secretWrites.map(secret => [secret.input, secretKeyToRef(secret.key)])),
        secretInputs: secretInputNames,
    };
    const sourceArtifacts = buildSourceArtifacts(definition, context);
    const sourceWrites = await buildSourceWrites(deps, sourceArtifacts, options);

    return writeSecretsWithRollback(
        deps.secrets,
        secretWrites,
        (secretResults) => writeSourcesWithRollback(deps.sources, sourceWrites, async artifacts => {
            const importResult = {
                artifacts,
                ...(secretResults.length ? { secrets: secretResults } : {}),
            };
            return commit
                ? { importResult, committed: await commit(importResult) }
                : { importResult };
        }),
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

function buildSecretWrites(
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
