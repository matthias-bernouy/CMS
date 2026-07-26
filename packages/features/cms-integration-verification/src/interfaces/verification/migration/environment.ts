import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../../runner";

export const MIGRATION_VERIFICATION_ENVIRONMENT_SCHEMA =
    "cms.integration.migration-verification-environment.v1" as const;

export type MigrationVerificationEnvironmentV1 = Readonly<{
    schema: typeof MIGRATION_VERIFICATION_ENVIRONMENT_SCHEMA;
    postgres: Readonly<{
        version: string;
        imageDigest: string;
    }>;
    runner: Readonly<{
        digest: string;
        identity: PinnedVerificationRunnerIdentity;
    }>;
    bootstrapSqlDigest: string;
    roles: readonly Readonly<{
        name: string;
        attributes: readonly string[];
    }>[];
    grants: readonly Readonly<{
        grantee: string;
        objectType: "database" | "schema" | "table" | "sequence" | "function";
        object: string;
        privileges: readonly string[];
    }>[];
    extensions: readonly Readonly<{
        name: string;
        version: string;
    }>[];
    fixtures: readonly Readonly<{
        fixtureId: string;
        digest: string;
    }>[];
    sessionSettings: readonly Readonly<{
        name: string;
        value: string;
    }>[];
    policy: VerificationPolicyIdentity;
}>;

export type IdentifiedMigrationVerificationEnvironmentV1 = Readonly<{
    environment: MigrationVerificationEnvironmentV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;
