import { expect, test } from "bun:test";
import { SQL } from "bun";
import { readBoundarySnapshot } from "../../../src/sandbox/service/postgres/catalog";
import { failedResult } from "../../../src/sandbox/service/postgres/migrations/results";
import { MigrationVerificationPhaseError } from "../../../src/sandbox/service/postgres/migrations/execution/phases";
import { disposablePostgresAvailable } from "../postgresFixture";
import { withMigrationVerifier } from "./fixture/harness";
import { migrationExecutionFixture } from "./fixture/input";
import { MIGRATION_SQL, migrationPackageFixture } from "./fixture/packages";

const postgresTest = disposablePostgresAvailable ? test : test.skip;
const WRONG_DIGEST = `sha256:${"0".repeat(64)}` as const;

postgresTest(
    "checks exact fresh and migration-aware source install digests before executing SQL",
    async () => {
        await withMigrationVerifier("cms-migration-install-digest", async ({ verifier, database }) => {
            const fresh = await migrationExecutionFixture(
                database,
                await migrationPackageFixture(MIGRATION_SQL, { targetInstallDigest: WRONG_DIGEST }),
            );
            const [freshResult] = await verifier.verify(fresh.input, new AbortController().signal);
            expect(freshResult?.observations.freshTarget).toMatchObject({
                status: "failed",
                diagnosticCodes: ["postgres-fresh-proof-failed"],
            });
            expect(freshResult?.observations.migratedTarget.status).toBe("not-supported");

            const source = await migrationExecutionFixture(
                database,
                await migrationPackageFixture(MIGRATION_SQL, { sourceInstallDigest: WRONG_DIGEST }),
            );
            const [sourceResult] = await verifier.verify(source.input, new AbortController().signal);
            expect(sourceResult?.observations.freshTarget.status).toBe("not-supported");
            expect(sourceResult?.observations.migratedTarget).toMatchObject({
                status: "failed",
                diagnosticCodes: ["postgres-source-proof-failed"],
            });
        });
    },
    60_000,
);

postgresTest(
    "fails declared SQL equivalence when owned table data differs between fresh and migrated targets",
    async () => {
        await withMigrationVerifier("cms-migration-data-equivalence", async ({ verifier, database }) => {
            const sourceSql = `CREATE SCHEMA IF NOT EXISTS migration_probe;
CREATE TABLE IF NOT EXISTS migration_probe.items (id bigint PRIMARY KEY);
INSERT INTO migration_probe.items (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`;
            const targetSql = `CREATE SCHEMA IF NOT EXISTS migration_probe;
CREATE TABLE IF NOT EXISTS migration_probe.items (id bigint PRIMARY KEY, description text);
ALTER TABLE migration_probe.items ADD COLUMN IF NOT EXISTS description text;
INSERT INTO migration_probe.items (id, description) VALUES (1, 'fresh')
ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description;
`;
            const fixture = await migrationExecutionFixture(
                database,
                await migrationPackageFixture(MIGRATION_SQL, { sourceSql, targetSql }),
            );
            const [result] = await verifier.verify(fixture.input, new AbortController().signal);

            expect(result?.observations.freshTarget.status).toBe("passed");
            expect(result?.observations.migratedTarget.status).toBe("passed");
            expect(result?.observations.freshTarget.dataDigest).toBeDefined();
            expect(result?.observations.freshTarget.dataDigest).not.toBe(
                result?.observations.migratedTarget.dataDigest,
            );
            expect(result?.observations.equivalence).toMatchObject({
                status: "failed",
                equivalent: false,
                diagnosticCodes: [
                    "edge-functions-not-covered",
                    "edge-functions-not-executed",
                    "sql-schema-and-data-equivalence",
                ],
                differences: [
                    { surface: "data", path: "dependency-matrix/minimum/owned-tables" },
                    { surface: "data", path: "dependency-matrix/stable/owned-tables" },
                ],
            });
            expect(result?.observations.freshTarget.diagnosticCodes).toContain("edge-functions-not-executed");
            expect(result?.observations.freshTarget.functionDigests).toEqual([]);
        });
    },
    60_000,
);

postgresTest(
    "observes partitioned table data through forced row-level security without changing the policy",
    async () => {
        await withMigrationVerifier("cms-migration-partition-data", async ({ database }) => {
            const sql = new SQL(database.connectionUri, { max: 1 });
            try {
                await sql.unsafe(`CREATE SCHEMA migration_partition_probe;
CREATE TABLE migration_partition_probe.items (id bigint PRIMARY KEY) PARTITION BY RANGE (id);
CREATE TABLE migration_partition_probe.items_low PARTITION OF migration_partition_probe.items
FOR VALUES FROM (0) TO (100);
INSERT INTO migration_partition_probe.items (id) VALUES (1);
ALTER TABLE migration_partition_probe.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_partition_probe.items FORCE ROW LEVEL SECURITY;`);

                const snapshot = await readBoundarySnapshot(sql, []);
                const data = snapshot.rows.filter(
                    (row) => row.objectType === "table-data" && row.namespace === "migration_partition_probe",
                );
                expect(data.map((row) => row.identity)).toEqual(["items", "items_low"]);
                expect(data.map((row) => row.definition.split("\0")[0])).toEqual(["1", "1"]);
                const [security] = (await sql.unsafe(`SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
FROM pg_catalog.pg_class
WHERE oid = 'migration_partition_probe.items'::regclass`)) as Array<{
                    enabled: boolean;
                    forced: boolean;
                }>;
                expect(security).toEqual({ enabled: true, forced: true });
            } finally {
                await sql.close();
            }
        });
    },
    60_000,
);

test("classifies replay and Bun errno infrastructure failures without blaming the fresh target", async () => {
    const fixture = await migrationExecutionFixture({ databaseId: "unused", connectionUri: "postgres://unused" });
    const input = fixture.input.migrationInputs[0]!;
    const environmentDigest = input.environment.digest;
    const replay = await failedResult(
        input,
        fixture.input.attempt,
        environmentDigest,
        new MigrationVerificationPhaseError("replay", new Error("replay failed")),
    );
    expect(replay.observations.freshTarget.status).toBe("not-supported");
    expect(replay.observations.replay).toMatchObject({
        status: "not-supported",
        diagnosticCodes: ["postgres-replay-proof-failed"],
    });

    const equivalence = await failedResult(
        input,
        fixture.input.attempt,
        environmentDigest,
        new MigrationVerificationPhaseError("equivalence", new Error("equivalence observation failed")),
    );
    expect(equivalence.observations.freshTarget.status).toBe("not-supported");
    expect(equivalence.observations.equivalence).toMatchObject({
        status: "not-supported",
        diagnosticCodes: ["postgres-equivalence-proof-failed"],
    });

    const infrastructure = await failedResult(
        input,
        fixture.input.attempt,
        environmentDigest,
        new MigrationVerificationPhaseError("migration", {
            errno: "08006",
            code: "ERR_POSTGRES_SERVER_ERROR",
        }),
    );
    expect(infrastructure.observations.freshTarget.status).toBe("not-supported");
    expect(infrastructure.observations.migratedTarget).toMatchObject({
        status: "infrastructure-failure",
        diagnosticCodes: ["postgres-migration-infrastructure-failure"],
    });
});
