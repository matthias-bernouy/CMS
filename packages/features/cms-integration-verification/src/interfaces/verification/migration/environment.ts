import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../../runner";

export const MIGRATION_VERIFICATION_ENVIRONMENT_SCHEMA =
    "cms.integration.migration-verification-environment.v1" as const;

export const CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1 = {
    postgres: {
        version: "16.14",
        imageDigest: "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
    },
    bootstrap: {
        contract: "cms-integration-verifier-postgres-bootstrap-v2",
        schemas: ["auth", "cms_verifier_guard", "extensions", "public", "storage"],
        actorMemberships: [
            { actor: "candidate", role: "anon", adminOption: false, inheritOption: false, setOption: true },
            { actor: "candidate", role: "authenticated", adminOption: false, inheritOption: false, setOption: true },
        ],
        auth: {
            externalOwner: true,
            providerOwned: true,
            publicUsage: false,
            publicCreate: false,
            usageRoles: ["anon", "authenticated", "candidate", "external-owner", "service_role"],
            createRoles: ["external-owner"],
            helpers: [
                {
                    name: "jwt",
                    returnType: "jsonb",
                    securityInvoker: true,
                    externalOwner: true,
                    providerOwned: true,
                    volatility: "stable",
                    configuration: [],
                    executeRoles: ["anon", "authenticated", "candidate", "external-owner", "service_role"],
                    sourceDigest: "2bde2dbd053161212a33ad29a0ac81ec0d8f63feb34c456b1a43b6c891c60b34",
                },
                {
                    name: "uid",
                    returnType: "uuid",
                    securityInvoker: true,
                    externalOwner: true,
                    providerOwned: true,
                    volatility: "stable",
                    configuration: [],
                    executeRoles: ["anon", "authenticated", "candidate", "external-owner", "service_role"],
                    sourceDigest: "e99e313bda0a79065dc69abcdfa1d7b89881fc735f4eb733ba297acc3bba91a6",
                },
            ],
        },
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
        {
            name: "anon",
            attributes: [
                "connection-limit-unlimited",
                "inherit",
                "no-bypassrls",
                "no-createdb",
                "no-createrole",
                "no-login",
                "no-replication",
                "no-superuser",
            ],
        },
        {
            name: "authenticated",
            attributes: [
                "connection-limit-unlimited",
                "inherit",
                "no-bypassrls",
                "no-createdb",
                "no-createrole",
                "no-login",
                "no-replication",
                "no-superuser",
            ],
        },
        {
            name: "service_role",
            attributes: [
                "bypassrls",
                "connection-limit-unlimited",
                "inherit",
                "no-createdb",
                "no-createrole",
                "no-login",
                "no-replication",
                "no-superuser",
            ],
        },
    ],
    grants: [
        { grantee: "anon", objectType: "function", object: "auth.jwt()", privileges: ["execute"] },
        { grantee: "anon", objectType: "function", object: "auth.uid()", privileges: ["execute"] },
        { grantee: "anon", objectType: "schema", object: "auth", privileges: ["usage"] },
        { grantee: "authenticated", objectType: "function", object: "auth.jwt()", privileges: ["execute"] },
        { grantee: "authenticated", objectType: "function", object: "auth.uid()", privileges: ["execute"] },
        { grantee: "authenticated", objectType: "schema", object: "auth", privileges: ["usage"] },
        {
            grantee: "candidate",
            objectType: "database",
            object: "current_database",
            privileges: ["connect", "create", "temporary"],
        },
        { grantee: "candidate", objectType: "function", object: "auth.jwt()", privileges: ["execute"] },
        { grantee: "candidate", objectType: "function", object: "auth.uid()", privileges: ["execute"] },
        { grantee: "candidate", objectType: "schema", object: "auth", privileges: ["usage"] },
        { grantee: "candidate", objectType: "schema", object: "extensions", privileges: ["usage"] },
        { grantee: "service_role", objectType: "function", object: "auth.jwt()", privileges: ["execute"] },
        { grantee: "service_role", objectType: "function", object: "auth.uid()", privileges: ["execute"] },
        { grantee: "service_role", objectType: "schema", object: "auth", privileges: ["usage"] },
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
