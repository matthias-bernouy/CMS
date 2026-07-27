import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../../runner";

export const MIGRATION_VERIFICATION_ENVIRONMENT_SCHEMA =
    "cms.integration.migration-verification-environment.v1" as const;

export const CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1 = {
    postgres: {
        version: "16.14",
        imageDigest: "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
    },
    bootstrap: {
        contract: "cms-integration-verifier-postgres-bootstrap-v1",
        schemas: ["cms_verifier_guard", "extensions", "public", "storage"],
        storageBuckets: {
            columns: [
                "allowed_mime_types:text[]:nullable:",
                "file_size_limit:bigint:nullable:",
                "id:text:not-null:",
                "name:text:not-null:",
                "owner:uuid:nullable:",
                "public:boolean:not-null:false",
            ],
            constraints: ["buckets_name_key:UNIQUE (name)", "buckets_pkey:PRIMARY KEY (id)"],
        },
        extensionGuard: {
            eventTrigger: "cms_verifier_extension_allowlist:ddl_command_end:ALTER EXTENSION,CREATE EXTENSION:O",
            function: "cms_verifier_guard.enforce_extension_allowlist():security-definer:pg_catalog",
            sourceDigest: "71fcddfcb6bcad238d536ebefcf59ca6483bcf4fc7528337536da764d79d90a3",
        },
        extensionsUsageGranted: true,
    },
    roles: [
        { name: "anon", attributes: ["no-bypassrls", "no-login"] },
        { name: "authenticated", attributes: ["no-bypassrls", "no-login"] },
        { name: "service_role", attributes: ["bypassrls", "no-login"] },
    ],
    extensions: [{ name: "pgcrypto", version: "1.3" }],
    sessionSettings: [{ name: "search_path", value: "public,extensions" }],
} as const;

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
