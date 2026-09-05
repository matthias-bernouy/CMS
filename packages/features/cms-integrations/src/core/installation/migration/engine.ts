import { randomUUID } from "node:crypto";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import { sanitizeDefinitionSnapshot } from "../snapshots";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type { IntegrationImportDeps } from "../../../interfaces/IntegrationImport";
import type {
    IntegrationInstallation,
    IntegrationMigrationJournalEntry,
} from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import type {
    IntegrationMigrationConnectorTransition,
    IntegrationMigrationRuntime,
    ResolvedIntegrationPackageRoot,
} from "../../../interfaces/IntegrationConnectorDeployer";
import type { RunIntegrationInstallationResult } from "../execution/runIntegrationInstallation";
import {
    activateMigrationTarget,
    completeIntegrationMigration,
    markMigrationPointOfNoReturn,
    pauseIntegrationMigration,
} from "./lifecycle";
import { runMigrationPhases } from "./phases";
import {
    migrationStepIdentity,
    planConnectorTransitions,
    POST_ACTIVATION_PHASES,
    PRE_ACTIVATION_PHASES,
} from "./planning";
import { claimMigrationOperation, type MigrationClock, systemMigrationClock } from "./state";
import {
    runMigrationTargetReconciliation,
    validateMigrationTargetHooks,
    validateMigrationTargetReconciliation,
} from "./lifecycle/reconciliation";

export type DurableMigrationUpgradeRequest = {
    installations: IntegrationInstallationRepository;
    installation: IntegrationInstallation;
    targetDefinition: IntegrationDefinition;
    resolvedPackage: ResolvedIntegrationPackageRoot;
    runtime: IntegrationMigrationRuntime;
    clock?: MigrationClock;
    leaseMs?: number;
    declarativeDeps?: IntegrationImportDeps;
};

export async function runDurableMigrationUpgrade(
    request: DurableMigrationUpgradeRequest,
): Promise<RunIntegrationInstallationResult> {
    const clock = request.clock ?? systemMigrationClock;
    const leaseMs = validatedLeaseMs(request.leaseMs ?? 60_000);
    if (!request.installation.definitionSnapshot) {
        throw new IntegrationInputError("version", "migration requires the exact installed definition snapshot");
    }
    await validateMigrationTargetHooks(
        request.installation.migrationOperation?.sourceDefinition ?? request.installation.definitionSnapshot,
        request.targetDefinition,
        request.installations,
    );
    const connectors = planConnectorTransitions(
        request.installation,
        request.targetDefinition,
        request.resolvedPackage.digest,
    );
    if (!connectors.length) {
        throw new IntegrationInputError("version", "target does not declare a migration-aware connector");
    }
    const operationId = currentOrNewOperationId(request.installation);
    let installation = await claimMigrationOperation({
        repository: request.installations,
        installation: request.installation,
        targetVersion: requiredVersion(request.targetDefinition),
        targetPackageDigest: request.resolvedPackage.digest,
        operationId,
        targetDefinition: sanitizeDefinitionSnapshot(request.targetDefinition),
        connectors,
        journal: await buildJournal(operationId, request.resolvedPackage.digest, connectors),
        clock,
        leaseMs,
    });
    const claimedConnectors = installation.migrationOperation?.connectors;
    if (!claimedConnectors) {
        throw new IntegrationRuntimeError("claimed migration operation is missing connector transitions");
    }

    try {
        if (!installation.migrationOperation?.activatedAt) {
            installation = await runMigrationPhases(
                request,
                installation,
                claimedConnectors,
                PRE_ACTIVATION_PHASES,
                clock,
                leaseMs,
            );
            installation = await activateMigrationTarget(request, installation, claimedConnectors, clock, leaseMs);
        }
        installation = await runMigrationPhases(request, installation, claimedConnectors, ["drain"], clock, leaseMs);
        await validateMigrationTargetReconciliation({
            deps: request.declarativeDeps,
            installations: request.installations,
            installation,
            clock,
            leaseMs,
        });
        if (!installation.migrationOperation?.pointOfNoReturnReachedAt) {
            installation = await markMigrationPointOfNoReturn(request.installations, installation, clock, leaseMs);
        }
        installation = await runMigrationPhases(
            request,
            installation,
            claimedConnectors,
            ["point-of-no-return"],
            clock,
            leaseMs,
        );
        installation = await runMigrationPhases(request, installation, claimedConnectors, ["contract"], clock, leaseMs);
        installation = await runMigrationTargetReconciliation({
            deps: request.declarativeDeps,
            installations: request.installations,
            installation,
            clock,
            leaseMs,
        });
        return await completeIntegrationMigration(request.installations, installation, clock, leaseMs);
    } catch (error) {
        await pauseIntegrationMigration(request.installations, installation, clock, leaseMs, error);
        throw error;
    }
}

async function buildJournal(
    operationId: string,
    targetPackageDigest: string,
    connectors: IntegrationMigrationConnectorTransition[],
): Promise<IntegrationMigrationJournalEntry[]> {
    return await Promise.all(
        [...PRE_ACTIVATION_PHASES, ...POST_ACTIVATION_PHASES].map(async (phase) => ({
            ...(await migrationStepIdentity({ operationId, phase, targetPackageDigest, connectors })),
            phase,
            status: "pending" as const,
        })),
    );
}

function currentOrNewOperationId(installation: IntegrationInstallation): string {
    const current = installation.migrationOperation;
    return current && current.status !== "completed" && current.status !== "aborted" ? current.id : randomUUID();
}

function requiredVersion(definition: IntegrationDefinition): string {
    if (!definition.version) {
        throw new IntegrationInputError("version", "migration target must declare a version");
    }
    return definition.version;
}

function validatedLeaseMs(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1_000 || value > 3_600_000) {
        throw new IntegrationRuntimeError("migration lease must be between 1000 and 3600000 milliseconds");
    }
    return value;
}

export {
    abortIntegrationMigration,
    ambiguousMigrationReconciliationRetryConfirmation,
    retryAmbiguousMigrationReconciliation,
    type AbortIntegrationMigrationRequest,
    type RetryAmbiguousMigrationReconciliationRequest,
} from "./lifecycle";
