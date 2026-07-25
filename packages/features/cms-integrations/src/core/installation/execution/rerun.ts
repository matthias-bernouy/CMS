import { findIntegration } from "../../definitions/catalog";
import { IntegrationInputError, MissingIntegrationInstallationError } from "../../errors";
import {
    declarativeSecretBindingNames,
    importDeclarativeIntegrationWithCommit,
    resolveDeclarativeSecretRefs,
} from "../../import/declarative";
import { withObsoleteArtifactCleanup } from "../artifactCleanup";
import { reconcileAfterInstallation } from "./afterInstallation";
import { appendRun, failedRun, successRun } from "./runs";
import { assertSecretKeysAvailable, deleteObsoleteSecretRefs } from "../secretRefs";
import { sanitizeAnswers, sanitizeDefinitionSnapshot, updateSecretRefs } from "../snapshots";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type { IntegrationImportDto, IntegrationImportResult } from "../../../interfaces/IntegrationImport";
import type { IntegrationInstallation, IntegrationRun } from "../../../interfaces/IntegrationInstallation";
import type {
    RunIntegrationInstallationRerunRequest,
    RunIntegrationInstallationResult,
    RunIntegrationInstallationUpgradeRequest,
} from "./runIntegrationInstallation";
import { assertResolvedRerunDefinition, assertRerunVersion, buildRerunDto } from "./rerunRequest";

type ExistingInstallationRequest = RunIntegrationInstallationRerunRequest | RunIntegrationInstallationUpgradeRequest;

export async function runRerun(
    request: RunIntegrationInstallationRerunRequest,
): Promise<RunIntegrationInstallationResult> {
    const installation = await request.installations.get(request.integrationId);
    if (!installation) {
        throw new MissingIntegrationInstallationError(request.integrationId);
    }
    assertRerunVersion(installation, request.body?.version);

    const siteIntegrations = [
        ...(installation.definitionSnapshot ? [installation.definitionSnapshot] : []),
        ...(request.siteIntegrations ?? []),
    ];
    const definition = findIntegration(installation.id, siteIntegrations);
    if (!definition) {
        throw new IntegrationInputError("kind", `unknown integration "${installation.id}"`);
    }
    assertResolvedRerunDefinition(installation, definition);

    return runExistingInstallation(request, installation, definition, siteIntegrations);
}

export async function runUpgrade(
    request: RunIntegrationInstallationUpgradeRequest,
): Promise<RunIntegrationInstallationResult> {
    const installation = await request.installations.get(request.integrationId);
    if (!installation) {
        throw new MissingIntegrationInstallationError(request.integrationId);
    }
    const definition = findIntegration(installation.id, [request.targetDefinition]);
    if (!definition) {
        throw new IntegrationInputError("kind", `upgrade target must match integration "${installation.id}"`);
    }
    if (!definition.version) {
        throw new IntegrationInputError("version", "upgrade target must declare an exact version");
    }
    if (definition.version === installation.definitionVersion) {
        throw new IntegrationInputError("version", `version "${definition.version}" is already installed`);
    }
    const siteIntegrations = [
        definition,
        ...(request.siteIntegrations ?? []).filter((candidate) => candidate.kind !== definition.kind),
    ];

    return runExistingInstallation(request, installation, definition, siteIntegrations);
}

async function runExistingInstallation(
    request: ExistingInstallationRequest,
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
    siteIntegrations: IntegrationDefinition[],
): Promise<RunIntegrationInstallationResult> {
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
    request: ExistingInstallationRequest,
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
    request: ExistingInstallationRequest,
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
        ...(request.mode === "upgrade"
            ? {
                  definitionVersion: definition.version as string,
                  definitionSnapshot: sanitizeDefinitionSnapshot(definition),
              }
            : {}),
    });
    return withObsoleteArtifactCleanup({
        deps: request.deps,
        installations: request.installations,
        installationId: installation.id,
        previousArtifacts: installation.artifacts,
        nextArtifacts: result.artifacts,
        operation: async () => {
            const saved = await request.installations.replace(next);
            if (request.mode === "upgrade") {
                await reconcileAfterInstallation(request.deps, request.installations, saved.id);
            }
            await deleteObsoleteSecretRefs(request.deps.secrets, installation.secretRefs, saved.secretRefs);
            return { installation: saved, run };
        },
    });
}
