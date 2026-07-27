import type { IntegrationDefinition, ObservedSchemaContractV1 } from "@bernouy/cms-integrations";

export type SqlConnectorPlan = Readonly<{
    connectorKey: string;
    lineageId: string;
    root: string;
    schemas: NonNullable<NonNullable<IntegrationDefinition["connectors"]>[number]["schemas"]>;
    declaredSchema: NonNullable<
        NonNullable<NonNullable<IntegrationDefinition["connectors"]>[number]["compatibility"]>["schema"]
    >;
    ownedNamespaces: readonly string[];
    dataApiSchemas: readonly string[];
}>;

export type LoadedSqlPackage = Readonly<{
    root: string;
    definition: IntegrationDefinition;
    connectors: readonly SqlConnectorPlan[];
}>;

export type CatalogFingerprintRow = Readonly<{
    objectType: string;
    namespace: string;
    identity: string;
    definition: string;
}>;

export type BoundarySnapshot = Readonly<{
    digest: string;
    rows: readonly CatalogFingerprintRow[];
}>;

export type ObservedConnectorSchema = Readonly<{
    connectorKey: string;
    lineageId: string;
    declaredDigest: string;
    observedDigest: string;
    observed: ObservedSchemaContractV1;
}>;

export type RlsObservation = Readonly<{
    relations: readonly Readonly<{
        namespace: string;
        relation: string;
        kind: string;
        rlsEnabled: boolean;
        rlsForced: boolean;
        exposedRoles: readonly string[];
    }>[];
    policies: readonly Readonly<{
        namespace: string;
        relation: string;
        name: string;
        command: string;
        roles: readonly string[];
        permissive: boolean;
        usingExpression?: string;
        checkExpression?: string;
    }>[];
}>;

export type GrantObservation = Readonly<{
    objectType: "schema" | "relation" | "column" | "sequence" | "routine";
    namespace: string;
    objectName: string;
    grantee: string;
    privilege: string;
    grantable: boolean;
}>;

export type RoleMembershipObservation = Readonly<{
    actor: "anon" | "authenticated";
    inheritedRole: string;
    depth: number;
    superuser: boolean;
    bypassRls: boolean;
}>;

export type UnknownSurfaceObservation = Readonly<{
    namespace: string;
    objectName: string;
    kind: string;
    exposedRoles: readonly string[];
}>;

export type ViewObservation = Readonly<{
    namespace: string;
    name: string;
    kind: "view" | "materialized-view";
    ownedBySessionRole: boolean;
    securityInvoker: boolean;
    selectGrantees: readonly string[];
}>;

export type RoutineObservation = Readonly<{
    namespace: string;
    identity: string;
    ownedBySessionRole: boolean;
    securityDefiner: boolean;
    configuration: readonly string[];
    executeGrantees: readonly string[];
}>;
