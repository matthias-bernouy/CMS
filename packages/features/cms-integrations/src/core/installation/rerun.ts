import { findIntegration } from "../catalog";
import { IntegrationInputError, MissingIntegrationInstallationError } from "../errors";
import {
    declarativeSecretBindingNames,
    importDeclarativeIntegrationWithCommit,
    resolveDeclarativeSecretRefs,
} from "../import/declarative";
import { parseIntegrationImportDto } from "../parsing/parseIntegrationImportDto";
import { isSensitiveInput } from "../shared/inputSensitivity";
import { hasAnswer } from "./ids";
import { withObsoleteArtifactCleanup } from "./artifactCleanup/index";
import { appendRun, failedRun, successRun } from "./runs";
import { assertSecretKeysAvailable, deleteObsoleteSecretRefs } from "./secretRefs";
import { sanitizeAnswers, sanitizeDefinitionSnapshot, updateSecretRefs } from "./snapshots";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type {
    IntegrationImportDeps,
    IntegrationImportDto,
    IntegrationImportResult,
} from "../../interfaces/IntegrationImport";
import type { IntegrationInstallation, IntegrationRun } from "../../interfaces/IntegrationInstallation";
import type {
    RunIntegrationInstallationRerunRequest,
    RunIntegrationInstallationResult,
} from "./runIntegrationInstallation";

export async function runRerun(
    request: RunIntegrationInstallationRerunRequest,
): Promise<RunIntegrationInstallationResult> {
    const installation = await request.installations.get(request.integrationId);
    if (!installation) {
        throw new MissingIntegrationInstallationError(request.integrationId);
    }

    const siteIntegrations = [
        ...(request.siteIntegrations ?? []),
        ...(installation.definitionSnapshot ? [installation.definitionSnapshot] : []),
    ];
    const definition = findIntegration(installation.id, siteIntegrations);
    if (!definition) {
        throw new IntegrationInputError("kind", `unknown integration "${installation.id}"`);
    }

    const pending = { ...installation, status: "pending" as const, updatedAt: new Date() };
    await request.installations.replace(pending);
    const startedAt = new Date();

    try {
        return await runRerunImport(request, pending, definition, startedAt, siteIntegrations);
    } catch (error) {
        const run = failedRun(installation.runCount + 1, startedAt, error);
        await request.installations.replace(appendRun(pending, run, { status: "failed" }));
        throw error;
    }
}

async function runRerunImport(
    request: RunIntegrationInstallationRerunRequest,
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
    startedAt: Date,
    siteIntegrations: IntegrationDefinition[],
): Promise<RunIntegrationInstallationResult> {
    const dto = await buildRerunDto(request.deps, installation, definition, request.body ?? {}, siteIntegrations);
    const secretInputs = declarativeSecretBindingNames(definition);
    const plannedSecretRefs = resolveDeclarativeSecretRefs(definition, dto.answers);
    await assertSecretKeysAvailable(request.installations, installation.id, plannedSecretRefs);

    const deps = { ...request.deps, installations: request.deps.installations ?? request.installations };
    const { importResult, committed } = await importDeclarativeIntegrationWithCommit(
        deps,
        definition,
        dto.answers,
        dto.options,
        async (result) =>
            commitSuccessfulRerun(request, installation, definition, dto, secretInputs, startedAt, result),
    );
    return { ...importResult, ...committed };
}

async function commitSuccessfulRerun(
    request: RunIntegrationInstallationRerunRequest,
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
    dto: IntegrationImportDto,
    secretInputs: string[],
    startedAt: Date,
    result: IntegrationImportResult,
): Promise<{ installation: IntegrationInstallation; run: IntegrationRun }> {
    const run = successRun(installation.runCount + 1, startedAt, result);
    const nextSecretRefs = updateSecretRefs(installation.secretRefs, result, secretInputs);
    const next = appendRun(installation, run, {
        status: "success",
        artifacts: result.artifacts,
        answersSnapshot: sanitizeAnswers(definition, dto.answers),
        secretRefs: nextSecretRefs,
        secretInputs,
        definitionVersion: definition.version ?? installation.definitionVersion,
        definitionSnapshot: sanitizeDefinitionSnapshot(definition),
    });
    return withObsoleteArtifactCleanup({
        deps: request.deps,
        installations: request.installations,
        installationId: installation.id,
        previousArtifacts: installation.artifacts,
        nextArtifacts: result.artifacts,
        operation: async () => {
            const saved = await request.installations.replace(next);
            await deleteObsoleteSecretRefs(request.deps.secrets, installation.secretRefs, saved.secretRefs);
            return { installation: saved, run };
        },
    });
}

async function buildRerunDto(
    deps: IntegrationImportDeps,
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
    body: Record<string, unknown>,
    siteIntegrations: IntegrationDefinition[],
): Promise<IntegrationImportDto> {
    const rawAnswers = isRecord(body.answers)
        ? { ...installation.answersSnapshot, ...rerunAnswerOverrides(definition, installation, body.answers) }
        : { ...installation.answersSnapshot };
    const missing = definition.inputs.filter((input) => isSensitiveInput(input) && !hasAnswer(rawAnswers[input.name]));
    const restored = await Promise.all(missing.map((input) => restoreSecretAnswer(deps, installation, input.name)));
    for (const [name, value] of restored) {
        rawAnswers[name] = value;
    }
    const rawOptions = isRecord(body.options) ? body.options : {};
    return parseIntegrationImportDto(
        {
            kind: installation.id,
            answers: rawAnswers,
            options: { ...rawOptions, force: true },
        },
        siteIntegrations,
    );
}

async function restoreSecretAnswer(
    deps: IntegrationImportDeps,
    installation: IntegrationInstallation,
    inputName: string,
): Promise<readonly [string, string]> {
    const key = installation.secretRefs[inputName];
    if (!key) {
        throw new IntegrationInputError(`answers.${inputName}`, "secret must be provided");
    }
    const value = await deps.secrets.get(key);
    if (!value) {
        throw new IntegrationInputError(`answers.${inputName}`, "stored secret is missing");
    }
    return [inputName, value] as const;
}

function rerunAnswerOverrides(
    definition: IntegrationDefinition,
    installation: IntegrationInstallation,
    answers: Record<string, unknown>,
): Record<string, unknown> {
    const overrides = { ...answers };
    if (Object.prototype.hasOwnProperty.call(overrides, "id")) {
        const hasIdentityInput = definition.inputs.some((input) => input.name === "id");
        if (hasIdentityInput && !sameAnswer(overrides.id, installation.answersSnapshot.id)) {
            throw new IntegrationInputError("answers.id", "cannot be changed on rerun");
        }
        delete overrides.id;
    }
    return overrides;
}

function sameAnswer(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
