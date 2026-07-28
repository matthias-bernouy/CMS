import type {
    IntegrationConnectorBaselineAdoptionContext,
    IntegrationConnectorMigrationDeployment,
} from "@bernouy/cms-integrations";
import {
    buildSupabaseBaselineAdoptionSql,
    buildSupabaseFreshInstallSql,
    buildSupabaseMigrationFenceRegistrationSql,
    buildSupabaseMigrationPhaseSql,
    buildSupabaseMigrationRuntimeSchemaSql,
    type LoadedSupabaseMigration,
    type SupabaseMigrationExecution,
} from "@bernouy/cms-integrations/supabase";

export const DATABASE = "cmscore_contracts_migration_fence";
export const SOURCE_PACKAGE_DIGEST = "e".repeat(64);
export const TARGET_PACKAGE_DIGEST = "f".repeat(64);

const INSTALL_DIGEST = `sha256:${"c".repeat(64)}` as const;
const MIGRATION_CHECKSUM = `sha256:${"a".repeat(64)}` as const;

export function sourceInstallSql(): string {
    return [
        buildSupabaseFreshInstallSql({
            integrationKind: "commerce",
            version: "1.0.0",
            provider: "supabase",
            migration: connectorDeployment(),
            schemas: [
                {
                    id: "source.sql",
                    kind: "file",
                    sourceFiles: ["source.sql"],
                    sql: "CREATE TABLE public.orders (id bigint PRIMARY KEY);",
                },
            ],
            attemptId: "source-install",
            packageDigest: SOURCE_PACKAGE_DIGEST,
        }),
        "UPDATE cms_integration_runtime.connector_instances SET package_digest = NULL;",
    ].join("\n");
}

export function runtimeSchemaSql(): string {
    return buildSupabaseMigrationRuntimeSchemaSql();
}

export function legacyAdoptionSql(): string {
    return buildSupabaseBaselineAdoptionSql(adoptionContext(), INSTALL_DIGEST);
}

export function execution(fencingToken: number, attemptId: string): SupabaseMigrationExecution {
    return {
        sourcePackageDigest: SOURCE_PACKAGE_DIGEST,
        targetPackageDigest: TARGET_PACKAGE_DIGEST,
        operationId: "operation-fenced",
        attemptId,
        fencingToken,
    };
}

export function registrationSql(value: SupabaseMigrationExecution): string {
    return buildSupabaseMigrationFenceRegistrationSql({
        integrationKind: "commerce",
        migration: connectorDeployment(),
        execution: value,
    });
}

export function phaseSql(value: SupabaseMigrationExecution): string {
    return buildSupabaseMigrationPhaseSql({
        integrationKind: "commerce",
        version: "1.1.0",
        provider: "supabase",
        migration: connectorDeployment(),
        migrations: [migration()],
        repeatables: [],
        execution: value,
        finalizeTargetPackageDigest: true,
    });
}

export function connectorDeployment(): IntegrationConnectorMigrationDeployment {
    return {
        connectorKey: "primary",
        lineageId: "commerce-v1",
        connectorInstanceId: "connector-instance-1",
        migrationRevision: 1,
        plan: {
            install: { revision: 1, digest: INSTALL_DIGEST, coveredMigrations: [] },
            migrations: [],
            supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
            pointOfNoReturn: "before-contract",
        },
    };
}

function migration(): LoadedSupabaseMigration {
    return {
        id: "expand-fenced",
        checksum: MIGRATION_CHECKSUM,
        fromRevision: 1,
        toRevision: 2,
        introducedIn: "1.1.0",
        transaction: "atomic",
        phase: "expand",
        path: "migrations/0002-expand-fenced.sql",
        sql: [
            "SELECT pg_sleep(0.3);",
            "ALTER TABLE public.orders ADD COLUMN fenced text;",
            "INSERT INTO public.orders (id, fenced) VALUES (1, 'applied');",
        ].join("\n"),
    };
}

function adoptionContext(): IntegrationConnectorBaselineAdoptionContext {
    return {
        integrationKind: "commerce",
        sourceVersion: "1.0.0",
        sourcePackageDigest: SOURCE_PACKAGE_DIGEST,
        targetVersion: "1.1.0",
        targetPackageDigest: TARGET_PACKAGE_DIGEST,
        connectorKey: "primary",
        provider: "supabase",
        lineageId: "commerce-v1",
        connectorInstanceId: "connector-instance-1",
        migrationRevision: 1,
        coveredMigrations: [],
        baseline: {
            definitionVersion: "1.0.0",
            packageDigest: SOURCE_PACKAGE_DIGEST,
            coveredMigrations: [],
            observedSchema: {
                schema: "cms.integration.observed-schema.v1",
                owner: { connectorKey: "primary", lineageId: "commerce-v1" },
                namespaces: [],
            },
        },
        attemptId: "adoption-attempt",
    };
}
