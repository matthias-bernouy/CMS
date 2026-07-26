import type { IntegrationAnswerValue, IntegrationDefinition } from "./Integration";
import type { IntegrationArtifactResult, IntegrationImportResult, IntegrationSecretResult } from "./IntegrationImport";
import type {
    IntegrationConnectorDeployResult,
    IntegrationMigrationConnectorTransition,
} from "./IntegrationConnectorDeployer";

export type IntegrationInstallationStatus = "success" | "failed" | "pending";

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
};

export type IntegrationMigrationOperationStatus = "running" | "paused" | "activated" | "completed" | "aborted";

export type IntegrationMigrationOperation = {
    id: string;
    revision: number;
    status: IntegrationMigrationOperationStatus;
    currentVersion: string;
    currentPackageDigest?: string;
    targetVersion: string;
    targetPackageDigest: string;
    sourceDefinition: IntegrationDefinition;
    targetDefinition: IntegrationDefinition;
    connectors: IntegrationMigrationConnectorTransition[];
    attemptId: string;
    fencingToken: number;
    leaseExpiresAt: Date;
    startedAt: Date;
    updatedAt: Date;
    activatedAt?: Date;
    pointOfNoReturnReachedAt?: Date;
    journal: IntegrationMigrationJournalEntry[];
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
    connectorBaselineAdoptions?: IntegrationConnectorBaselineAdoptionAudit[];
    migrationOperation?: IntegrationMigrationOperation;
    status: IntegrationInstallationStatus;
    createdAt: Date;
    updatedAt: Date;
    runCount: number;
    answersSnapshot: Record<string, IntegrationAnswerValue>;
    secretRefs: Record<string, string>;
    secretInputs: string[];
    artifacts: IntegrationArtifactResult[];
    runs: IntegrationRun[];
};
