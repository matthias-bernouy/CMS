import { expect, test } from "bun:test";
import { SQL } from "bun";
import {
    DATABASE,
    execution,
    legacyAdoptionSql,
    phaseSql,
    registrationSql,
    runtimeSchemaSql,
    SOURCE_PACKAGE_DIGEST,
    sourceInstallSql,
    TARGET_PACKAGE_DIGEST,
} from "./fixture";

const enabled =
    process.env.ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET === "cmscore-postgres-contracts" && !!process.env.DATABASE_URL;
const postgresTest = enabled ? test : test.skip;

postgresTest("a superseded database fence rolls back migration and ledger writes atomically", async () => {
    const baseUrl = requireDisposableDatabaseUrl();
    const admin = new SQL(baseUrl, { max: 1 });
    await resetDatabase(admin);
    const stale = new SQL(databaseUrl(baseUrl), { max: 1 });
    const current = new SQL(databaseUrl(baseUrl), { max: 1 });
    const observer = new SQL(databaseUrl(baseUrl), { max: 1 });
    try {
        await observer.unsafe(sourceInstallSql());
        await observer.unsafe(runtimeSchemaSql());
        const staleExecution = execution(1, "attempt-stale");

        const missingDigest = await capturedSqlError(observer, registrationSql(staleExecution));
        expect(missingDigest.message).toMatch(/source package digest conflict/);
        await observer.unsafe(legacyAdoptionSql());
        await observer.unsafe(registrationSql(staleExecution));

        const staleWrite = stale
            .unsafe(phaseSql(staleExecution))
            .then(() => undefined)
            .catch(async (error: unknown) => {
                await stale.unsafe("ROLLBACK");
                return error;
            });
        await Bun.sleep(75);
        const currentExecution = execution(2, "attempt-current");
        await current.unsafe(registrationSql(currentExecution));

        const staleError = await staleWrite;
        expect(staleError).toBeInstanceOf(Error);
        expect((staleError as Error).message).toMatch(/migration attempt was fenced/);
        expect(await observedState(observer)).toEqual({
            revision: "1",
            packageDigest: SOURCE_PACKAGE_DIGEST,
            ledger: [],
            columnCount: "0",
            rows: [],
        });

        await current.unsafe(phaseSql(currentExecution));
        expect(await observedState(observer)).toEqual({
            revision: "2",
            packageDigest: TARGET_PACKAGE_DIGEST,
            ledger: [
                {
                    migration_id: "expand-fenced",
                    source_package_digest: SOURCE_PACKAGE_DIGEST,
                    target_package_digest: TARGET_PACKAGE_DIGEST,
                    operation_id: "operation-fenced",
                    attempt_id: "attempt-current",
                    fencing_token: "2",
                },
            ],
            columnCount: "1",
            rows: [{ id: "1", fenced: "applied" }],
        });

        const resumedExecution = execution(3, "attempt-resumed");
        await current.unsafe(registrationSql(resumedExecution));
        await current.unsafe(phaseSql(resumedExecution));
        const staleRegistration = await capturedSqlError(stale, registrationSql(staleExecution));
        expect(staleRegistration.message).toMatch(/migration attempt was fenced/);
    } finally {
        await Promise.all([stale.close(), current.close(), observer.close()]);
        await resetDatabase(admin, false);
        await admin.close();
    }
});

postgresTest("concurrent runtime schema initialization is serialized", async () => {
    const baseUrl = requireDisposableDatabaseUrl();
    const admin = new SQL(baseUrl, { max: 1 });
    await resetDatabase(admin);
    const first = new SQL(databaseUrl(baseUrl), { max: 1 });
    const second = new SQL(databaseUrl(baseUrl), { max: 1 });
    const observer = new SQL(databaseUrl(baseUrl), { max: 1 });
    try {
        await Promise.all([first.unsafe(runtimeSchemaSql()), second.unsafe(runtimeSchemaSql())]);
        const tables = await observer`
            SELECT table_name
              FROM information_schema.tables
             WHERE table_schema = 'cms_integration_runtime'
             ORDER BY table_name
        `;
        expect(tables.map((entry) => entry.table_name)).toEqual([
            "connector_instances",
            "migration_fences",
            "migration_ledger",
            "repeatable_ledger",
        ]);
    } finally {
        await Promise.all([first.close(), second.close(), observer.close()]);
        await resetDatabase(admin, false);
        await admin.close();
    }
});

async function observedState(sql: SQL) {
    const instances = await sql`
        SELECT migration_revision, package_digest FROM cms_integration_runtime.connector_instances
    `;
    const ledger = await sql`
        SELECT migration_id, source_package_digest, target_package_digest, operation_id, attempt_id, fencing_token
          FROM cms_integration_runtime.migration_ledger WHERE migration_id = 'expand-fenced'
    `;
    const columns = await sql`
        SELECT count(*) AS count FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'fenced'
    `;
    const rows = await sql`SELECT id, to_jsonb(orders)->>'fenced' AS fenced FROM public.orders ORDER BY id`;
    return {
        revision: String(instances[0]?.migration_revision),
        packageDigest: String(instances[0]?.package_digest),
        ledger: [...ledger],
        columnCount: String(columns[0]?.count),
        rows: [...rows],
    };
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

async function resetDatabase(admin: SQL, create = true): Promise<void> {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    if (create) {
        await admin.unsafe(`CREATE DATABASE ${DATABASE} TEMPLATE template0 ENCODING 'UTF8'`);
    }
}

function requireDisposableDatabaseUrl(): string {
    const value = process.env.DATABASE_URL!;
    const parsed = new URL(value);
    const database = parsed.pathname.slice(1);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || !database.startsWith("cmscore_contracts")) {
        throw new Error("migration fencing requires a loopback cmscore_contracts database");
    }
    return value;
}

function databaseUrl(base: string): string {
    const value = new URL(base);
    value.pathname = `/${DATABASE}`;
    return value.toString();
}
