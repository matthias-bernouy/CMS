import type { ObservedSchemaContractV1 } from "./schemaObservation";

export type IntegrationMigrationChecksum = `sha256:${string}`;

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

export type IntegrationCmsMediatedCutover = {
    strategy: "binding-switch";
    drainSeconds?: number;
};

export type IntegrationProviderDirectCutover =
    | { strategy: "expand-in-code"; callbackIds: string[]; drainSeconds?: number }
    | { strategy: "journalled-provider-switch"; callbackIds: string[]; drainSeconds?: number };

export type DeclarativeConnectorLegacyAdoptionBaseline = {
    definitionVersion: string;
    packageDigest: string;
    observedSchema: ObservedSchemaContractV1;
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
