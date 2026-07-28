import { expect, test } from "bun:test";
import type { SQL } from "bun";
import { createPostgresMigrationVerifier } from "../../../src/sandbox/service/postgres/migrations";
import { installMigrationSource } from "../../../src/sandbox/service/postgres/migrations/execution";
import {
    createMigrationPackageLoader,
    requireTargetConnector,
} from "../../../src/sandbox/service/postgres/migrations/packages";
import { disposablePostgresAvailable, startDisposablePostgres } from "../postgresFixture";
import { withMigrationVerifier } from "./fixture/harness";
import { migrationExecutionFixture } from "./fixture/input";
import { MIGRATION_SQL, migrationPackageFixture } from "./fixture/packages";
import { clockEquivalence, clockProjectionInvalidTargets, clockSchema, clockTableSql } from "./fixture/projection";

const postgresTest = disposablePostgresAvailable ? test : test.skip;
const WRONG_DIGEST = `sha256:${"0".repeat(64)}` as const;

test("rejects a legacy source install digest before executing its SQL", async () => {
    const release = await migrationPackageFixture(MIGRATION_SQL, { legacySourceInstallDigest: WRONG_DIGEST });
    const fixture = await migrationExecutionFixture(
        { databaseId: "unused", connectionUri: "postgres://unused" },
        release,
    );
    const input = fixture.input.migrationInputs[0]!;
    const loader = createMigrationPackageLoader({});
    const statements: string[] = [];
    const database = {
        async unsafe(statement: string) {
            statements.push(statement);
            return [];
        },
    } as unknown as SQL;
    try {
        const target = await loader.load(release.target);
        const source = await loader.load(release.source);
        const connector = await requireTargetConnector(target, input);
        await expect(installMigrationSource(database, source, connector, input, "attempt-1")).rejects.toThrow(
            /legacy source install baseline digest mismatch/,
        );
        expect(statements).toEqual([]);
    } finally {
        await loader.dispose();
    }
});

postgresTest(
    "keeps non-projected data exact when a database-clock projection is active",
    async () => {
        await withMigrationVerifier("cms-migration-projected-data", async ({ verifier, database }) => {
            const sourceSql = clockTableSql("source");
            const targetSql = clockTableSql("fresh");
            const fixture = await migrationExecutionFixture(
                database,
                await migrationPackageFixture(MIGRATION_SQL, {
                    sourceSql,
                    targetSql,
                    sourceSchema: clockSchema(),
                    targetSchema: clockSchema(),
                    equivalence: clockEquivalence(),
                }),
            );
            const [result] = await verifier.verify(fixture.input, new AbortController().signal);

            expect(result?.observations.equivalence).toMatchObject({
                status: "failed",
                equivalent: false,
                differences: [
                    { surface: "data", path: "dependency-matrix/minimum/owned-tables" },
                    { surface: "data", path: "dependency-matrix/stable/owned-tables" },
                ],
            });
            expect(result?.observations.equivalence.diagnosticCodes).toContain(
                "database-clock-default-projection-applied",
            );
        });
    },
    60_000,
);

postgresTest(
    "fails closed when an observed database-clock column or primary key contradicts the projection",
    async () => {
        await withMigrationVerifier("cms-migration-projection-contract", async ({ verifier, database }) => {
            for (const targetSql of clockProjectionInvalidTargets()) {
                const fixture = await migrationExecutionFixture(
                    database,
                    await migrationPackageFixture(MIGRATION_SQL, {
                        sourceSql: clockTableSql("source"),
                        targetSql,
                        sourceSchema: clockSchema(),
                        targetSchema: clockSchema(),
                        equivalence: clockEquivalence(),
                    }),
                );
                const [result] = await verifier.verify(fixture.input, new AbortController().signal);
                expect(result?.observations.freshTarget).toMatchObject({
                    status: "failed",
                    diagnosticCodes: ["postgres-fresh-proof-failed"],
                });
                expect(result?.observations.equivalence.status).toBe("not-supported");
            }
        });
    },
    60_000,
);

postgresTest(
    "refuses an administrative or non-disposable PostgreSQL target before resetting it",
    async () => {
        const postgres = await startDisposablePostgres();
        const verifier = createPostgresMigrationVerifier({});
        try {
            const fixture = await migrationExecutionFixture({
                databaseId: "postgres",
                connectionUri: `postgresql://postgres:${postgres.password}@${postgres.host}:${postgres.port}/postgres?sslmode=disable`,
            });

            await expect(verifier.verify(fixture.input, new AbortController().signal)).rejects.toThrow(
                /refused a non-disposable or privileged PostgreSQL target/,
            );
            expect(postgres.executeAs(fixture.input.database.connectionUri, "select 1").exitCode).toBe(0);
        } finally {
            await verifier.dispose();
            await postgres.close();
        }
    },
    30_000,
);
