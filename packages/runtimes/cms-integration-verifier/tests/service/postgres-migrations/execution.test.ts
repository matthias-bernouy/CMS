import { expect, test } from "bun:test";
import { SQL } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { createPostgresMigrationVerifier } from "../../../src/sandbox/service/postgres/migrations";
import { disposablePostgresAvailable } from "../postgresFixture";
import { startMigrationPostgres } from "./fixture/harness";
import { migrationExecutionFixture } from "./fixture/input";
import { migrationPackageFixture } from "./fixture/packages";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "proves exact fresh, migrated, replay, and ledger state in both dependency matrices",
    async () => {
        const postgres = await startMigrationPostgres();
        const packageTempRoot = await mkdtemp(join(tmpdir(), "cms-migration-verifier-test-"));
        try {
            const provider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            const lease = await provider.acquire(
                {
                    candidateId: "migration-candidate",
                    packageDigest: "a".repeat(64),
                    verificationDigest: "b".repeat(64),
                },
                new AbortController().signal,
            );
            const verifier = createPostgresMigrationVerifier({ packageTempRoot });
            try {
                const fixture = await migrationExecutionFixture(lease.credential);
                const [result] = await verifier.verify(fixture.input, new AbortController().signal);

                expect(result?.migrationInputDigest).toBe(fixture.migrationInputDigest);
                expect(result?.observations.freshTarget.status).toBe("passed");
                expect(result?.observations.migratedTarget.status).toBe("passed");
                expect(result?.observations.equivalence).toMatchObject({ status: "passed", equivalent: true });
                expect(result?.observations.freshTarget.dataDigest).toBe(
                    result?.observations.migratedTarget.dataDigest,
                );
                expect(result?.observations.replay).toMatchObject({
                    status: "passed",
                    unchanged: true,
                    ledgerRowsBefore: 0,
                    ledgerRowsAfterFirstRun: 1,
                    ledgerRowsAfterReplay: 1,
                });
                expect(result?.observations.ledger).toMatchObject({
                    status: "passed",
                    freshBaselineRecorded: true,
                    migrationAndLedgerAtomic: true,
                    checksumMismatchRejected: true,
                    emptyLedgerRejected: true,
                });
                expect(result?.observations.ledger.rows).toEqual([
                    expect.objectContaining({
                        migrationId: "add-description",
                        revision: 1,
                        attemptId: fixture.input.attempt.attemptId,
                        sourcePackageDigest: fixture.packages.source.digest,
                        targetPackageDigest: fixture.packages.target.digest,
                    }),
                ]);
                expect(result?.observations.freshTarget.evidenceDigests).toHaveLength(2);
                expect(result?.observations.failureInjections).toEqual([]);
                expect(result?.observations.resumptions).toEqual([]);
                expect(result?.observations.cutover).toMatchObject({
                    cmsMediated: { status: "not-applicable", strategy: "not-applicable" },
                    providerDirect: { status: "not-applicable", strategy: "not-applicable" },
                    activation: { status: "not-supported" },
                });

                const database = new SQL(lease.credential.connectionUri, { max: 1 });
                try {
                    const rows = (await database.unsafe(
                        "select count(*)::int as count from pg_catalog.pg_namespace where nspname = 'migration_probe'",
                    )) as Array<{ count: number }>;
                    expect(rows[0]?.count).toBe(0);
                } finally {
                    await database.close();
                }
            } finally {
                await verifier.dispose();
                await lease.release();
            }
        } finally {
            await rm(packageTempRoot, { recursive: true, force: true });
            await postgres.close();
        }
    },
    60_000,
);

postgresTest(
    "returns a structured fail-closed result when exact migration SQL fails",
    async () => {
        const postgres = await startMigrationPostgres();
        const packageTempRoot = await mkdtemp(join(tmpdir(), "cms-migration-failure-test-"));
        try {
            const provider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            const lease = await provider.acquire(
                { candidateId: "broken-migration", packageDigest: "c".repeat(64), verificationDigest: "d".repeat(64) },
                new AbortController().signal,
            );
            const verifier = createPostgresMigrationVerifier({ packageTempRoot });
            try {
                const fixture = await migrationExecutionFixture(
                    lease.credential,
                    await migrationPackageFixture("SELECT 1 / 0;\n"),
                );
                const [result] = await verifier.verify(fixture.input, new AbortController().signal);

                expect(result?.observations.freshTarget.status).toBe("not-supported");
                expect(result?.observations.migratedTarget).toMatchObject({
                    status: "failed",
                    diagnosticCodes: ["postgres-migration-proof-failed"],
                });
                expect(result?.observations.equivalence.status).toBe("not-supported");
                expect(result?.observations.ledger.status).toBe("not-supported");
                expect(result?.observations.replay.status).toBe("not-supported");
            } finally {
                await verifier.dispose();
                await lease.release();
            }
        } finally {
            await rm(packageTempRoot, { recursive: true, force: true });
            await postgres.close();
        }
    },
    60_000,
);
