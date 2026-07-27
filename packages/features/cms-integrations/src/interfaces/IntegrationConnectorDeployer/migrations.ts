import type { ObservedSchemaContractV1 } from "./schemaObservation";
import type { IntegrationAnswerValue } from "../Integration";

export type IntegrationMigrationChecksum = `sha256:${string}`;

export const MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES = 64 * 1_024;

export type DeclarativeConnectorMigrationReference = {
    id: string;
    checksum: IntegrationMigrationChecksum;
    revision: number;
    introducedIn: string;
};

export type DeclarativeConnectorMigrationDescriptor = Omit<DeclarativeConnectorMigrationReference, "revision"> & {
    fromRevision: number;
    toRevision: number;
    transaction: "atomic";
    phase: "expand" | "contract";
    path: string;
};

export type DeclarativeConnectorRepeatableDescriptor = {
    id: string;
    checksum: IntegrationMigrationChecksum;
    path: string;
};

export type DeclarativeConnectorInstallBaseline = {
    revision: number;
    digest: IntegrationMigrationChecksum;
    coveredMigrations: DeclarativeConnectorMigrationReference[];
};

export type IntegrationMigrationHttpSmoke = {
    endpointId: string;
    expectedStatus: number;
    expectedBody?: IntegrationAnswerValue;
};

export type IntegrationCmsMediatedCutover = {
    strategy: "binding-switch";
    smoke?: IntegrationMigrationHttpSmoke;
    drainSeconds?: number;
};

export type IntegrationProviderDirectCutover =
    | { strategy: "expand-in-code"; callbackIds: string[]; drainSeconds?: number }
    | { strategy: "journalled-provider-switch"; callbackIds: string[]; drainSeconds?: number };

export type DeclarativeConnectorDatabaseClockDefaultProjection = {
    kind: "database-clock-default";
    namespace: string;
    relation: string;
    columns: string[];
};

export type DeclarativeConnectorMigrationEquivalence = {
    dataProjections: DeclarativeConnectorDatabaseClockDefaultProjection[];
};

export type DeclarativeConnectorLegacyAdoptionBaseline = {
    definitionVersion: string;
    packageDigest: string;
    installDigest: IntegrationMigrationChecksum;
    observedSchema: ObservedSchemaContractV1;
    coveredMigrations: DeclarativeConnectorMigrationReference[];
};

export type DeclarativeConnectorMigrationSource = {
    range: string;
    migrationRevision: number;
    legacyAdoption?: DeclarativeConnectorLegacyAdoptionBaseline;
};

export type DeclarativeConnectorMigrationPlan = {
    install: DeclarativeConnectorInstallBaseline;
    migrations: DeclarativeConnectorMigrationDescriptor[];
    repeatables?: DeclarativeConnectorRepeatableDescriptor[];
    supportedSources: DeclarativeConnectorMigrationSource[];
    equivalence?: DeclarativeConnectorMigrationEquivalence;
    cmsMediated?: IntegrationCmsMediatedCutover;
    providerDirect?: IntegrationProviderDirectCutover;
    pointOfNoReturn: "before-contract";
};

export type IntegrationConnectorMigrationIdentity = {
    connectorKey: string;
    lineageId: string;
    migrationRevision: number;
};

export type IntegrationConnectorMigrationDeployment = IntegrationConnectorMigrationIdentity & {
    connectorInstanceId: string;
    plan: DeclarativeConnectorMigrationPlan;
};
