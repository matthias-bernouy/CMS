import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type {
    IntegrationDefinition,
    DeclarativeConnectorMigrationPlan,
    DeclarativeConnectorTemplate,
} from "@bernouy/cms-integrations";
import type {
    MigrationJobAttemptIdentityV1,
    MigrationJobResultV1,
    MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";

export type ExactMigrationPackage = Readonly<{
    digest: string;
    envelope: IntegrationPackageEnvelopeV1;
}>;

export type LoadedMigrationPackage = Readonly<{
    digest: string;
    envelope: IntegrationPackageEnvelopeV1;
    root: string;
    definition: IntegrationDefinition;
}>;

export type TargetMigrationConnector = Readonly<{
    connector: DeclarativeConnectorTemplate &
        Required<Pick<DeclarativeConnectorTemplate, "connectorKey" | "lineageId" | "migrationRevision" | "migration">>;
    plan: DeclarativeConnectorMigrationPlan;
}>;

export type MigrationVerificationExecutionInput = Readonly<{
    targetPackage: IntegrationPackageEnvelopeV1;
    migrationPackages: readonly ExactMigrationPackage[];
    migrationInputs: readonly MigrationVerificationInputV1[];
    attempt: MigrationJobAttemptIdentityV1;
    database: Readonly<{ databaseId: string; connectionUri: string }>;
}>;

export type MatrixState = Readonly<{
    selection: "minimum" | "stable";
    stateDigest: string;
    schemaDigest: string;
    dataDigest: string;
    functionDigests: readonly Readonly<{ functionId: string; digest: string }>[];
}>;

export type MatrixMigrationEvidence = Readonly<{
    selection: "minimum" | "stable";
    fresh: MatrixState;
    migrated: MatrixState;
    replay: MatrixState;
    ledgerRows: MigrationJobResultV1["observations"]["ledger"]["rows"];
    replayLedgerRows: MigrationJobResultV1["observations"]["ledger"]["rows"];
    ledgerRowsBefore: number;
    freshBaselineRecorded: boolean;
    migrationAndLedgerAtomic: boolean;
    checksumMismatchRejected: boolean;
    emptyLedgerRejected: boolean;
    evidenceDigests: readonly string[];
}>;
