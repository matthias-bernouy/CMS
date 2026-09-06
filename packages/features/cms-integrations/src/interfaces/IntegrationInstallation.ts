import type { IntegrationAnswerValue, IntegrationDefinition } from "./Integration";
import type { IntegrationArtifactResult, IntegrationImportResult, IntegrationSecretResult } from "./IntegrationImport";
import type {
    IntegrationConnectorDeployResult,
    IntegrationMigrationConnectorTransition,
} from "./IntegrationConnectorDeployer";

export type IntegrationInstallationStatus = "success" | "failed" | "pending";

export type IntegrationConnectorRuntimeTarget = {
    provider: string;
    outputs: Record<string, string>;
};

export type IntegrationConnectorBinding = {
    connectorKey: string;
    provider: string;
    lineageId: string;
    connectorInstanceId: string;
    migrationRevision: number;
    outputs: Record<string, string>;
};

export type IntegrationConnectorBaselineAdoptionAudit = {
    id: string;
    actor: string;
    adoptedAt: Date;
    sourceDefinitionVersion: string;
    sourcePackageDigest: string;
    targetDefinitionVersion: string;
    targetPackageDigest: string;
    connectorKey: string;
    provider: string;
    lineageId: string;
    connectorInstanceId: string;
    migrationRevision: number;
    baselineDigest: string;
    externalOperationId: string;
};

export type IntegrationMigrationJournalStatus = "pending" | "running" | "succeeded" | "failed";

export type IntegrationMigrationCompensationJournal = {
    status: "running" | "succeeded" | "failed";
    attemptId: string;
    startedAt: Date;
    externalOperationId?: string;
    confirmedAt?: Date;
    error?: IntegrationRunError;
};

export type IntegrationMigrationJournalEntry = {
    id: string;
    phase: import("./IntegrationConnectorDeployer").IntegrationMigrationPhase;
    targetDigest: string;
    idempotencyKey: string;
    status: IntegrationMigrationJournalStatus;
    attemptId?: string;
    externalOperationId?: string;
    confirmationDigest?: string;
    importResult?: IntegrationImportResult;
    startedAt?: Date;
    confirmedAt?: Date;
    error?: IntegrationRunError;
    compensation?: IntegrationMigrationCompensationJournal;
};

export type IntegrationMigrationOperationStatus = "running" | "paused" | "activated" | "completed" | "aborted";

export type IntegrationMigrationReconciliationResolution = {
    id: string;
    action: "retry";
    actor: string;
    reason: string;
    resolvedAt: Date;
    previousAttemptId: string;
    previousStatus: "running" | "failed";
};

export type IntegrationMigrationOperation = {
    id: string;
    revision: number;
    status: IntegrationMigrationOperationStatus;
    currentVersion: string;
    currentPackageDigest?: string;
    targetVersion: string;
    targetPackageDigest: string;
    sourceDefinition: IntegrationDefinition;
    sourceState?: {
        connectorBindings: Record<string, IntegrationConnectorBinding>;
        artifacts: IntegrationArtifactResult[];
    };
    targetDefinition: IntegrationDefinition;
    connectors: IntegrationMigrationConnectorTransition[];
    attemptId: string;
    fencingToken: number;
    leaseExpiresAt: Date;
    startedAt: Date;
    updatedAt: Date;
    activatedAt?: Date;
    pointOfNoReturnReachedAt?: Date;
    abortRequestedAt?: Date;
    abortRequestedBy?: string;
    abortReason?: string;
    abortedAt?: Date;
    reconciliationResolutions?: IntegrationMigrationReconciliationResolution[];
    journal: IntegrationMigrationJournalEntry[];
};

export type IntegrationPendingOperationSourceState = {
    status: IntegrationInstallationStatus;
    definitionVersion: string;
    definitionSnapshot?: IntegrationDefinition;
    packageDigest?: string;
    connectorBindings?: Record<string, IntegrationConnectorBinding>;
    answersSnapshot: Record<string, IntegrationAnswerValue>;
    secretRefs: Record<string, string>;
    secretInputs: string[];
    managementSecretRefs?: Record<string, string>;
    managementLease?: { id: string; expiresAt: Date };
    artifacts: IntegrationArtifactResult[];
    activeResources?: string[];
    runCount: number;
    runs: IntegrationRun[];
};

export type IntegrationPendingOperation = {
    id: string;
    startedAt: Date;
    sourceState: IntegrationPendingOperationSourceState;
};

export type IntegrationPendingOperationAbandonment = {
    id: string;
    operationId: string;
    legacyMarkerless?: true;
    actor: string;
    reason: string;
    abandonedAt: Date;
    externalReconciliationRequired: true;
};

export type IntegrationRunError = {
    message: string;
    status?: number;
};

export type IntegrationRun = {
    id: string;
    runNumber: number;
    status: IntegrationInstallationStatus;
    startedAt: Date;
    finishedAt: Date;
    artifacts: IntegrationArtifactResult[];
    secrets?: IntegrationSecretResult[];
    connectors?: IntegrationConnectorDeployResult[];
    error?: IntegrationRunError;
};

export type IntegrationInstallation = {
    id: string;
    label: string;
    definitionVersion: string;
    definitionSnapshot?: IntegrationDefinition;
    packageDigest?: string;
    connectorBindings?: Record<string, IntegrationConnectorBinding>;
    /** Deployment destinations for connectors without a migration lineage. */
    connectorRuntimeTargets?: IntegrationConnectorRuntimeTarget[];
    connectorBaselineAdoptions?: IntegrationConnectorBaselineAdoptionAudit[];
    migrationOperation?: IntegrationMigrationOperation;
    pendingOperation?: IntegrationPendingOperation;
    pendingOperationAbandonments?: IntegrationPendingOperationAbandonment[];
    status: IntegrationInstallationStatus;
    createdAt: Date;
    updatedAt: Date;
    runCount: number;
    answersSnapshot: Record<string, IntegrationAnswerValue>;
    secretRefs: Record<string, string>;
    secretInputs: string[];
    managementSecretRefs?: Record<string, string>;
    managementLease?: { id: string; expiresAt: Date };
    artifacts: IntegrationArtifactResult[];
    /** Exact active resource ids for collection installations. */
    activeResources?: string[];
    runs: IntegrationRun[];
};
