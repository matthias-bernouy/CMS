import { expect, test } from "bun:test";
import { SQL } from "bun";
import type {
    DeclarativeConnectorMigrationPlan,
    IntegrationConnectorMigrationDeployment,
} from "@bernouy/cms-integrations";
import {
    buildSupabaseFreshInstallSql,
    buildSupabaseMigrationPhaseSql,
    type LoadedSupabaseMigration,
} from "@bernouy/cms-integrations/supabase";

const enabled =
    process.env.ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET === "cmscore-postgres-contracts" && !!process.env.DATABASE_URL;
const postgresTest = enabled ? test : test.skip;
const CHECKSUM_EXPAND = `sha256:${"a".repeat(64)}` as const;
const CHECKSUM_CONTRACT = `sha256:${"b".repeat(64)}` as const;
const SOURCE_PACKAGE_DIGEST = "c".repeat(64);
const TARGET_PACKAGE_DIGEST = "d".repeat(64);
const DATABASES = ["cmscore_contracts_migration_fresh", "cmscore_contracts_migration_upgraded"] as const;

postgresTest("fresh and migrated Supabase targets are equivalent and migration replay is a no-op", async () => {
    const baseUrl = requireDisposableDatabaseUrl();
    const admin = new SQL(baseUrl, { max: 1 });
    try {
        await resetDatabases(admin);
        const fresh = new SQL(databaseUrl(baseUrl, DATABASES[0]), { max: 1 });
        const upgraded = new SQL(databaseUrl(baseUrl, DATABASES[1]), { max: 1 });
        try {
            await fresh.unsafe(freshTargetSql());
            const digestConflict = await capturedSqlError(fresh, freshTargetSql("e".repeat(64)));
            expect(digestConflict.message).toMatch(/fresh baseline conflict/);
            expect(await installedPackageDigest(fresh)).toBe(TARGET_PACKAGE_DIGEST);
            await fresh.unsafe("INSERT INTO public.orders (id, note) VALUES (1, NULL)");

            await upgraded.unsafe(sourceInstallSql());
            await upgraded.unsafe("INSERT INTO public.orders (id, legacy) VALUES (1, 'preserved')");
            await applyUpgrade(upgraded);
            const once = await observedState(upgraded);
            await applyUpgrade(upgraded);

            expect(await observedState(upgraded)).toEqual(once);
            expect(once).toEqual(await observedState(fresh));
        } finally {
            await fresh.close();
            await upgraded.close();
        }
    } finally {
        await resetDatabases(admin, false);
        await admin.close();
    }
});

async function applyUpgrade(sql: SQL): Promise<void> {
    const plan = targetPlan();
    await sql.unsafe(
        buildSupabaseMigrationPhaseSql({
            integrationKind: "commerce",
            version: "1.1.0",
            provider: "supabase",
            migration: deployment(1, plan),
            migrations: [plan.migrations[0] as LoadedSupabaseMigration],
            repeatables: [],
            attemptId: "upgrade-attempt",
        }),
    );
    await sql.unsafe(
        buildSupabaseMigrationPhaseSql({
            integrationKind: "commerce",
            version: "1.1.0",
            provider: "supabase",
            migration: deployment(2, plan),
            migrations: [plan.migrations[1] as LoadedSupabaseMigration],
            repeatables: [],
            attemptId: "upgrade-attempt",
        }),
    );
}

function sourceInstallSql(): string {
    return buildSupabaseFreshInstallSql({
        integrationKind: "commerce",
        version: "1.0.0",
        provider: "supabase",
        migration: deployment(1, {
            install: { revision: 1, digest: `sha256:${"c".repeat(64)}`, coveredMigrations: [] },
            migrations: [],
            supportedSources: [],
            pointOfNoReturn: "before-contract",
        }),
        schemas: [schema("CREATE TABLE public.orders (id bigint PRIMARY KEY, legacy text NOT NULL);", "source")],
        attemptId: "source-install",
        packageDigest: SOURCE_PACKAGE_DIGEST,
    });
}

function freshTargetSql(packageDigest = TARGET_PACKAGE_DIGEST): string {
    const plan = targetPlan();
    return buildSupabaseFreshInstallSql({
        integrationKind: "commerce",
        version: "1.1.0",
        provider: "supabase",
        migration: deployment(3, plan),
        schemas: [schema("CREATE TABLE public.orders (id bigint PRIMARY KEY, note text);", "target")],
        attemptId: "fresh-install",
        packageDigest,
    });
}

function targetPlan(): DeclarativeConnectorMigrationPlan {
    const migrations: LoadedSupabaseMigration[] = [
        {
            id: "expand-orders",
            checksum: CHECKSUM_EXPAND,
            fromRevision: 1,
            toRevision: 2,
            introducedIn: "1.1.0",
            transaction: "atomic",
            phase: "expand",
            path: "migrations/0002-expand.sql",
            sql: "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS note text;",
        },
        {
            id: "contract-orders",
            checksum: CHECKSUM_CONTRACT,
            fromRevision: 2,
            toRevision: 3,
            introducedIn: "1.1.0",
            transaction: "atomic",
            phase: "contract",
            path: "migrations/0003-contract.sql",
            sql: "ALTER TABLE public.orders DROP COLUMN IF EXISTS legacy;",
        },
    ];
    return {
        install: {
            revision: 3,
            digest: `sha256:${"d".repeat(64)}`,
            coveredMigrations: migrations.map((migration) => ({
                id: migration.id,
                checksum: migration.checksum,
                revision: migration.toRevision,
                introducedIn: migration.introducedIn,
            })),
        },
        migrations,
        supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
        pointOfNoReturn: "before-contract",
    };
}

function deployment(
    migrationRevision: number,
    plan: DeclarativeConnectorMigrationPlan,
): IntegrationConnectorMigrationDeployment {
    return {
        connectorKey: "primary",
        lineageId: "commerce-v1",
        connectorInstanceId: "connector-instance-1",
        migrationRevision,
        plan,
    };
}

function schema(sql: string, id: string) {
    return { id, kind: "file" as const, sourceFiles: [`${id}.sql`], sql };
}

async function observedState(sql: SQL) {
    const columns = await sql`
        SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'orders'
         ORDER BY ordinal_position
    `;
    const rows = await sql`SELECT id, note FROM public.orders ORDER BY id`;
    const ledger = await sql`
        SELECT migration_id, checksum, migration_revision, introduced_in
          FROM cms_integration_runtime.migration_ledger
         ORDER BY migration_revision, migration_id
    `;
    const instances = await sql`
        SELECT migration_revision, package_version
          FROM cms_integration_runtime.connector_instances
         ORDER BY connector_instance_id
    `;
    return { columns: [...columns], rows: [...rows], ledger: [...ledger], instances: [...instances] };
}

async function installedPackageDigest(sql: SQL): Promise<string> {
    const rows = await sql`SELECT package_digest FROM cms_integration_runtime.connector_instances`;
    return String(rows[0]?.package_digest);
}

async function capturedSqlError(sql: SQL, query: string): Promise<Error> {
    try {
        await sql.unsafe(query);
    } catch (error) {
        await sql.unsafe("ROLLBACK");
        return error as Error;
    }
    throw new Error("expected SQL query to fail");
}

async function resetDatabases(admin: SQL, create = true): Promise<void> {
    for (const name of DATABASES) {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
        if (create) {
            await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`);
        }
    }
}

function requireDisposableDatabaseUrl(): string {
    const value = process.env.DATABASE_URL!;
    const parsed = new URL(value);
    const database = parsed.pathname.slice(1);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || !database.startsWith("cmscore_contracts")) {
        throw new Error("migration equivalence requires a loopback cmscore_contracts database");
    }
    return value;
}

function databaseUrl(base: string, database: string): string {
    const value = new URL(base);
    value.pathname = `/${database}`;
    return value.toString();
}
