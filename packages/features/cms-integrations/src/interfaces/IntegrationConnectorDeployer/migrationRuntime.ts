import type { IntegrationDefinition } from "../Integration";
import type { IntegrationImportResult } from "../IntegrationImport";
import type { IntegrationInstallation, IntegrationMigrationOperation } from "../IntegrationInstallation";
import type {
    DeclarativeConnectorLegacyAdoptionBaseline,
    DeclarativeConnectorMigrationReference,
    DeclarativeConnectorMigrationPlan,
    IntegrationProviderDirectCutover,
} from "./migrations";

export type IntegrationMigrationPhase =
    | "expand"
    | "deploy-functions"
    | "smoke-target"
    | "provider-direct-transition"
    | "switch-cms-binding"
    | "smoke-cms"
    | "drain"
    | "point-of-no-return"
    | "contract";

export type IntegrationMigrationConnectorTransition = {
    connectorKey: string;
    provider: string;
    lineageId: string;
    connectorInstanceId: string;
    fromRevision: number;
    toRevision: number;
    plan: DeclarativeConnectorMigrationPlan;
};

export type IntegrationMigrationStepContext = {
    phase: IntegrationMigrationPhase;
    idempotencyKey: string;
    targetDigest: string;
    operation: IntegrationMigrationOperation;
    installation: IntegrationInstallation;
    sourceDefinition: IntegrationDefinition;
    targetDefinition: IntegrationDefinition;
    targetPackageRoot: string;
    connectors: IntegrationMigrationConnectorTransition[];
};

export type IntegrationMigrationStepResult = {
    confirmationDigest: string;
    externalOperationId?: string;
    importResult?: IntegrationImportResult;
};

export type IntegrationMigrationStepConfirmation = {
    confirmed: boolean;
    confirmationDigest?: string;
    externalOperationId?: string;
    importResult?: IntegrationImportResult;
};

export type IntegrationMigrationStepCompensation = {
    compensated: boolean;
    externalOperationId?: string;
};

export interface IntegrationMigrationRuntime {
    executeStep(context: IntegrationMigrationStepContext): Promise<IntegrationMigrationStepResult>;
    confirmStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ): Promise<IntegrationMigrationStepConfirmation>;
    compensateStep?(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ): Promise<IntegrationMigrationStepCompensation>;
}

export interface IntegrationConnectorMigrationAdapter {
    provider: string;
    executeDatabasePhase(
        context: IntegrationMigrationStepContext,
        connector: IntegrationMigrationConnectorTransition,
    ): Promise<{ externalOperationId?: string }>;
    confirmDatabasePhase(
        context: IntegrationMigrationStepContext,
        connector: IntegrationMigrationConnectorTransition,
    ): Promise<boolean>;
}

export interface IntegrationProviderDirectMigrationAdapter {
    provider: string;
    executeTransition(
        context: IntegrationMigrationStepContext,
        connector: IntegrationMigrationConnectorTransition,
        cutover: Extract<IntegrationProviderDirectCutover, { strategy: "journalled-provider-switch" }>,
    ): Promise<{ externalOperationId?: string }>;
    confirmTransition(
        context: IntegrationMigrationStepContext,
        connector: IntegrationMigrationConnectorTransition,
        cutover: Extract<IntegrationProviderDirectCutover, { strategy: "journalled-provider-switch" }>,
        previous: { externalOperationId?: string },
    ): Promise<boolean>;
    compensateTransition?(
        context: IntegrationMigrationStepContext,
        connector: IntegrationMigrationConnectorTransition,
        cutover: Extract<IntegrationProviderDirectCutover, { strategy: "journalled-provider-switch" }>,
        previous: { externalOperationId: string },
    ): Promise<IntegrationMigrationStepCompensation>;
}

export type IntegrationConnectorBaselineAdoptionContext = {
    integrationKind: string;
    sourceVersion: string;
    sourcePackageDigest: string;
    targetVersion: string;
    targetPackageDigest: string;
    connectorKey: string;
    provider: string;
    lineageId: string;
    connectorInstanceId: string;
    migrationRevision: number;
    baseline: DeclarativeConnectorLegacyAdoptionBaseline;
    coveredMigrations: readonly DeclarativeConnectorMigrationReference[];
    attemptId: string;
};

export interface IntegrationConnectorBaselineAdopter {
    provider: string;
    adopt(
        context: IntegrationConnectorBaselineAdoptionContext,
    ): Promise<{ baselineDigest: string; externalOperationId: string; outputs: Record<string, string> }>;
}

export type IntegrationMigrationProbe = {
    run(context: IntegrationMigrationStepContext): Promise<{ externalOperationId?: string }>;
};

export type IntegrationMigrationExternalPhaseHandler = {
    execute(
        context: IntegrationMigrationStepContext,
    ): Promise<{ externalOperationId?: string; importResult?: IntegrationImportResult }>;
    confirm(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ): Promise<{ confirmed: boolean; externalOperationId?: string; importResult?: IntegrationImportResult }>;
    compensate?(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ): Promise<IntegrationMigrationStepCompensation>;
};
