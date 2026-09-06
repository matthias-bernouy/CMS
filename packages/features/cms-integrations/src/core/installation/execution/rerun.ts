import { findIntegration } from "../../definitions/catalog";
import { integrationVersionReleaseLevel, isExactIntegrationVersion } from "../../definitions/versioning";
import { IntegrationInputError, IntegrationRuntimeError, MissingIntegrationInstallationError } from "../../errors";
import {
    declarativeSecretBindingNames,
    importDeclarativeIntegrationWithCommit,
    resolveDeclarativeSecretRefs,
} from "../../import/declarative";
import { withObsoleteArtifactCleanup } from "../artifactCleanup";
import { reconcileChangedInstallation } from "./afterInstallation";
import { appendRun, failedRun, successRun } from "./runs";
import { assertSecretKeysAvailable, deleteObsoleteSecretRefs } from "../secretRefs";
import {
    assertIntegrationInstallationProvenance,
    depsWithPackageRoot,
    resolveRerunPackage,
    resolveUpgradePackage,
} from "../packages";
import { declarativeValuesEqual, sanitizeAnswers, sanitizeDefinitionSnapshot, updateSecretRefs } from "../snapshots";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type { IntegrationImportDto, IntegrationImportResult } from "../../../interfaces/IntegrationImport";
import type { IntegrationInstallation, IntegrationRun } from "../../../interfaces/IntegrationInstallation";
import type { ResolvedIntegrationPackageRoot } from "../../../interfaces/IntegrationConnectorDeployer";
import type {
    RunIntegrationInstallationRerunRequest,
    RunIntegrationInstallationResult,
    RunIntegrationInstallationUpgradeRequest,
} from "./runIntegrationInstallation";
import { assertResolvedRerunDefinition, assertRerunVersion, buildRerunDto } from "./ordinary/request";
import {
    claimPendingIntegrationOperation,
    replaceCurrentInstallation,
    tryReplaceCurrentInstallation,
} from "./ordinary/claim";
import { assertUpgradePreservesDependentRanges } from "./upgradeDependencies";
import {
    connectorBindingsFromResult,
    connectorInstanceIds,
    connectorRuntimeTargetsFromResult,
} from "../migration/adoption/installationBindings";
import { runDurableMigrationUpgrade } from "../migration/engine";
import { resolveCollectionSelection } from "../../resources/selection";
import { assertCollectionConformance } from "../../resources/conformance";

type ExistingInstallationRequest = RunIntegrationInstallationRerunRequest | RunIntegrationInstallationUpgradeRequest;

export async function runRerun(
    request: RunIntegrationInstallationRerunRequest,
): Promise<RunIntegrationInstallationResult> {
    const installation = await request.installations.get(request.integrationId);
    if (!installation) {
        throw new MissingIntegrationInstallationError(request.integrationId);
    }
    assertNoUnfinishedMigration(installation);
    assertNoOrdinaryOperationInProgress(request, installation);
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
    const hasUnfinishedMigration =
        unfinishedMigration !== undefined &&
        unfinishedMigration.status !== "completed" &&
        unfinishedMigration.status !== "aborted";
    if (!hasUnfinishedMigration) {
        assertNoOrdinaryOperationInProgress(request, installation);
    }
    if (hasUnfinishedMigration && unfinishedMigration.targetVersion !== definition.version) {
        throw new IntegrationRuntimeError(
            `integration has unfinished migration "${unfinishedMigration.id}"; only its exact target can be resumed`,
            409,
        );
    }
    const resumingMigration = hasUnfinishedMigration && unfinishedMigration.targetVersion === definition.version;
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
    const resolvedPackage = await resolveUpgradePackage(
        request.packageResolver,
        installation,
        definition,
        request.expectedPackageDigest,
    );
    if (resumingMigration && (!resolvedPackage || resolvedPackage.digest !== unfinishedMigration.targetPackageDigest)) {
        throw new IntegrationRuntimeError(
            `integration migration "${unfinishedMigration.id}" can only resume its exact target package`,
            409,
        );
    }
    const importDefinition = resolvedPackage?.definition ?? definition;
    const siteIntegrations = [
        importDefinition,
        ...(request.siteIntegrations ?? []).filter((candidate) => candidate.kind !== importDefinition.kind),
    ];

    const migrationAwareTarget = (importDefinition.connectors ?? []).some((connector) => connector.migration);
    if (resumingMigration && !migrationAwareTarget) {
        throw new IntegrationRuntimeError(
            `integration migration "${unfinishedMigration.id}" target no longer declares its migration plan`,
            409,
        );
    }
    if (migrationAwareTarget) {
        assertMigrationUpgradeRequestSupported(request, installation, importDefinition);
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
            declarativeDeps: {
                ...depsWithPackageRoot(request.deps, resolvedPackage),
                installations: request.deps.installations ?? request.installations,
            },
        });
    }

    return runExistingInstallation(request, installation, importDefinition, siteIntegrations, resolvedPackage);
}

function assertNoOrdinaryOperationInProgress(
    request: ExistingInstallationRequest,
    installation: IntegrationInstallation,
): void {
    if (installation.managementLease && installation.managementLease.expiresAt.getTime() > Date.now()) {
        throw new IntegrationRuntimeError("Integration management operation is in progress", 409);
    }
    if (request.installations.compareAndSwapMigration && installation.status === "pending") {
        throw new IntegrationRuntimeError("integration installation has another operation in progress", 409);
    }
}

function assertNoUnfinishedMigration(installation: IntegrationInstallation): void {
    const operation = installation.migrationOperation;
    if (operation && operation.status !== "completed" && operation.status !== "aborted") {
        throw new IntegrationRuntimeError(
            `integration has unfinished migration "${operation.id}"; resume or abort it before rerun`,
            409,
        );
    }
}

function assertMigrationUpgradeRequestSupported(
    request: RunIntegrationInstallationUpgradeRequest,
    installation: IntegrationInstallation,
    target: IntegrationDefinition,
): void {
    const unsupportedBodyFields = Object.keys(request.body ?? {}).filter((field) => field !== "version");
    if (unsupportedBodyFields.length) {
        throw new IntegrationInputError(
            "body",
            `migration-aware upgrade does not support fields: ${unsupportedBodyFields.sort().join(", ")}`,
        );
    }
    if (request.body?.version !== undefined && request.body.version !== target.version) {
        throw new IntegrationInputError("version", "migration-aware upgrade body must match the exact target version");
    }
    const regularConnectors = (target.connectors ?? []).filter((connector) => !connector.migration);
    if (regularConnectors.length) {
        throw new IntegrationInputError(
            "version",
            `migration-aware upgrade cannot include connectors without a migration plan: ${regularConnectors
                .map((connector) => connector.provider)
                .join(", ")}`,
        );
    }
    const source = installation.migrationOperation?.sourceDefinition ?? installation.definitionSnapshot;
    if (!source) {
        throw new IntegrationInputError("version", "migration requires the exact installed definition snapshot");
    }
    for (const field of ["generatedSecrets", "secrets", "provisions", "afterInstallation"] as const) {
        if (!declarativeValuesEqual(source[field] ?? [], target[field] ?? [])) {
            throw new IntegrationInputError("version", `migration-aware upgrade cannot change declarative ${field}`);
        }
    }
}

async function runExistingInstallation(
    request: ExistingInstallationRequest,
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
    siteIntegrations: IntegrationDefinition[],
    resolvedPackage?: ResolvedIntegrationPackageRoot,
): Promise<RunIntegrationInstallationResult> {
    const pending = await claimPendingIntegrationOperation(request.installations, installation);
    const startedAt = new Date();

    try {
        return await runRerunImport(request, pending, definition, startedAt, siteIntegrations, resolvedPackage);
    } catch (error) {
        const run = failedRun(installation.runCount + 1, startedAt, error);
        await tryReplaceCurrentInstallation(
            request.installations,
            pending,
            appendRun({ ...installation, pendingOperation: undefined }, run, { status: installation.status }),
        );
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
    const selection =
        definition.schema === "cms.integration.definition.v2" && definition.type === "collection"
            ? resolveCollectionSelection(definition, dto.resources, installation.activeResources, siteIntegrations)
            : undefined;
    if (definition.schema === "cms.integration.definition.v2" && definition.type === "collection") {
        assertCollectionConformance(definition, siteIntegrations, selection?.activeResources);
    }
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
        { ...dto.options, ...(selection ? { activeResources: selection.activeResources } : {}) },
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
                selection?.activeResources,
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
    activeResources?: string[],
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
        connectorRuntimeTargets: connectorRuntimeTargetsFromResult(definition, result),
        ...(activeResources ? { activeResources } : {}),
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
            if (!request.installations.compareAndSwapMigration) {
                const saved = await request.installations.replace({ ...next, pendingOperation: undefined });
                await reconcileChangedInstallation(request.deps, request.installations, saved.id);
                await deleteObsoleteSecretRefs(
                    request.deps.secrets,
                    installation.secretRefs,
                    saved.secretRefs,
                    request.installations,
                );
                return { installation: saved, run };
            }
            const prepared = await replaceCurrentInstallation(request.installations, installation, {
                ...next,
                status: "pending",
                runCount: installation.runCount,
                runs: installation.runs,
                pendingOperation: installation.pendingOperation,
            });
            try {
                await reconcileChangedInstallation(request.deps, request.installations, prepared.id, {
                    pendingOwner: { id: prepared.pendingOperation!.id, updatedAt: prepared.updatedAt },
                    markFailure: false,
                });
                const saved = await replaceCurrentInstallation(request.installations, prepared, {
                    ...next,
                    pendingOperation: undefined,
                });
                await deleteObsoleteSecretRefs(
                    request.deps.secrets,
                    installation.secretRefs,
                    saved.secretRefs,
                    request.installations,
                );
                return { installation: saved, run };
            } catch (error) {
                const failure = failedRun(installation.runCount + 1, startedAt, error);
                await tryReplaceCurrentInstallation(
                    request.installations,
                    prepared,
                    appendRun({ ...installation, pendingOperation: undefined }, failure, {
                        status: installation.pendingOperation?.sourceState.status ?? "failed",
                    }),
                );
                throw error;
            }
        },
    });
}
