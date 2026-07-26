import { findIntegration } from "../../definitions/catalog";
import { integrationVersionReleaseLevel, isExactIntegrationVersion } from "../../definitions/versioning";
import { IntegrationInputError, IntegrationRuntimeError, MissingIntegrationInstallationError } from "../../errors";
import {
    declarativeSecretBindingNames,
    importDeclarativeIntegrationWithCommit,
    resolveDeclarativeSecretRefs,
} from "../../import/declarative";
import { withObsoleteArtifactCleanup } from "../artifactCleanup";
import { reconcileAfterInstallation } from "./afterInstallation";
import { appendRun, failedRun, successRun } from "./runs";
import { assertSecretKeysAvailable, deleteObsoleteSecretRefs } from "../secretRefs";
import {
    assertIntegrationInstallationProvenance,
    depsWithPackageRoot,
    resolveRerunPackage,
    resolveUpgradePackage,
} from "../packages";
import { sanitizeAnswers, sanitizeDefinitionSnapshot, updateSecretRefs } from "../snapshots";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type { IntegrationImportDto, IntegrationImportResult } from "../../../interfaces/IntegrationImport";
import type { IntegrationInstallation, IntegrationRun } from "../../../interfaces/IntegrationInstallation";
import type { ResolvedIntegrationPackageRoot } from "../../../interfaces/IntegrationConnectorDeployer";
import type {
    RunIntegrationInstallationRerunRequest,
    RunIntegrationInstallationResult,
    RunIntegrationInstallationUpgradeRequest,
} from "./runIntegrationInstallation";
import { assertResolvedRerunDefinition, assertRerunVersion, buildRerunDto } from "./rerunRequest";
import { assertUpgradePreservesDependentRanges } from "./upgradeDependencies";
import { connectorBindingsFromResult, connectorInstanceIds } from "../migration/adoption/installationBindings";
import { runDurableMigrationUpgrade } from "../migration/engine";

type ExistingInstallationRequest = RunIntegrationInstallationRerunRequest | RunIntegrationInstallationUpgradeRequest;

export async function runRerun(
    request: RunIntegrationInstallationRerunRequest,
): Promise<RunIntegrationInstallationResult> {
    const installation = await request.installations.get(request.integrationId);
    if (!installation) {
        throw new MissingIntegrationInstallationError(request.integrationId);
    }
    assertIntegrationInstallationProvenance(installation);
    assertRerunVersion(installation, request.body?.version);
    const resolvedPackage = await resolveRerunPackage(request.packageResolver, installation);

    const pinnedDefinition = installation.definitionSnapshot ?? resolvedPackage?.definition;
    const siteIntegrations = [...(pinnedDefinition ? [pinnedDefinition] : []), ...(request.siteIntegrations ?? [])];
    const definition = findIntegration(installation.id, siteIntegrations);
    if (!definition) {
        throw new IntegrationInputError("kind", `unknown integration "${installation.id}"`);
    }
    assertResolvedRerunDefinition(installation, definition);

    return runExistingInstallation(request, installation, definition, siteIntegrations, resolvedPackage);
}

export async function runUpgrade(
    request: RunIntegrationInstallationUpgradeRequest,
): Promise<RunIntegrationInstallationResult> {
    const installation = await request.installations.get(request.integrationId);
    if (!installation) {
        throw new MissingIntegrationInstallationError(request.integrationId);
    }
    assertIntegrationInstallationProvenance(installation);
    const definition = findIntegration(installation.id, [request.targetDefinition]);
    if (!definition) {
        throw new IntegrationInputError("kind", `upgrade target must match integration "${installation.id}"`);
    }
    if (!definition.version || !isExactIntegrationVersion(definition.version)) {
        throw new IntegrationInputError("version", "upgrade target must declare an exact version");
    }
    const unfinishedMigration = installation.migrationOperation;
    const resumingMigration =
        unfinishedMigration !== undefined &&
        unfinishedMigration.status !== "completed" &&
        unfinishedMigration.status !== "aborted" &&
        unfinishedMigration.targetVersion === definition.version;
    const comparisonVersion = resumingMigration ? unfinishedMigration.currentVersion : installation.definitionVersion;
    if (definition.version === installation.definitionVersion && !resumingMigration) {
        throw new IntegrationInputError("version", `version "${definition.version}" is already installed`);
    }
    if (
        isExactIntegrationVersion(comparisonVersion) &&
        integrationVersionReleaseLevel(comparisonVersion, definition.version) === null
    ) {
        throw new IntegrationInputError(
            "version",
            `version "${definition.version}" is not newer than installed version "${comparisonVersion}"`,
        );
    }
    await assertUpgradePreservesDependentRanges(request.installations, installation.id, definition.version);
    const resolvedPackage = await resolveUpgradePackage(request.packageResolver, installation, definition);
    const importDefinition = resolvedPackage?.definition ?? definition;
    const siteIntegrations = [
        importDefinition,
        ...(request.siteIntegrations ?? []).filter((candidate) => candidate.kind !== importDefinition.kind),
    ];

    if ((importDefinition.connectors ?? []).some((connector) => connector.migration)) {
        if (!resolvedPackage) {
            throw new IntegrationInputError("version", "migration-aware upgrade requires an immutable target package");
        }
        if (!request.deps.migrationRuntime) {
            throw new IntegrationRuntimeError("migration-aware upgrade runtime is not configured", 503);
        }
        return await runDurableMigrationUpgrade({
            installations: request.installations,
            installation,
            targetDefinition: importDefinition,
            resolvedPackage,
            runtime: request.deps.migrationRuntime,
            clock: request.deps.migrationClock,
            leaseMs: request.deps.migrationLeaseMs,
        });
    }

    return runExistingInstallation(request, installation, importDefinition, siteIntegrations, resolvedPackage);
}

async function runExistingInstallation(
    request: ExistingInstallationRequest,
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
    siteIntegrations: IntegrationDefinition[],
    resolvedPackage?: ResolvedIntegrationPackageRoot,
): Promise<RunIntegrationInstallationResult> {
    const pending = { ...installation, status: "pending" as const, updatedAt: new Date() };
    await request.installations.replace(pending);
    const startedAt = new Date();

    try {
        return await runRerunImport(request, pending, definition, startedAt, siteIntegrations, resolvedPackage);
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
    resolvedPackage?: ResolvedIntegrationPackageRoot,
): Promise<RunIntegrationInstallationResult> {
    const dto = await buildRerunDto(request.deps, installation, definition, request.body ?? {}, siteIntegrations);
    const secretInputs = declarativeSecretBindingNames(definition);
    const plannedSecretRefs = resolveDeclarativeSecretRefs(definition, dto.answers);
    await assertSecretKeysAvailable(request.installations, installation.id, plannedSecretRefs);

    const instanceIds = connectorInstanceIds(definition, installation.connectorBindings);
    const deps = {
        ...depsWithPackageRoot(request.deps, resolvedPackage),
        connectorInstanceIds: instanceIds,
        installations: request.deps.installations ?? request.installations,
    };
    const { importResult, committed } = await importDeclarativeIntegrationWithCommit(
        deps,
        definition,
        dto.answers,
        dto.options,
        async (result) =>
            commitSuccessfulRerun(
                request,
                installation,
                definition,
                dto,
                secretInputs,
                startedAt,
                result,
                resolvedPackage,
                instanceIds,
            ),
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
    resolvedPackage?: ResolvedIntegrationPackageRoot,
    instanceIds: Record<string, string> = {},
): Promise<{ installation: IntegrationInstallation; run: IntegrationRun }> {
    const run = successRun(installation.runCount + 1, startedAt, result);
    const nextSecretRefs = updateSecretRefs(installation.secretRefs, result, secretInputs);
    const next = appendRun(installation, run, {
        status: "success",
        artifacts: result.artifacts,
        answersSnapshot: sanitizeAnswers(definition, dto.answers),
        secretRefs: nextSecretRefs,
        secretInputs,
        connectorBindings: connectorBindingsFromResult(definition, result, instanceIds, installation.connectorBindings),
        ...(!installation.packageDigest && resolvedPackage ? { packageDigest: resolvedPackage.digest } : {}),
        ...(request.mode === "upgrade"
            ? {
                  definitionVersion: definition.version as string,
                  definitionSnapshot: sanitizeDefinitionSnapshot(definition),
                  ...(resolvedPackage ? { packageDigest: resolvedPackage.digest } : {}),
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
