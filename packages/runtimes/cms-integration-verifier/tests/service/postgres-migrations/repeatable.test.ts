import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { createPostgresMigrationVerifier } from "../../../src/sandbox/service/postgres/migrations";
import { disposablePostgresAvailable } from "../postgresFixture";
import { startMigrationPostgres } from "./fixture/harness";
import { migrationExecutionFixture } from "./fixture/input";
import { repeatableMigrationPackageFixture } from "./fixture/repeatable";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "proves an atomic repeatable-only update without inventing a numbered migration",
    async () => {
        const postgres = await startMigrationPostgres();
        const packageTempRoot = await mkdtemp(join(tmpdir(), "cms-repeatable-verifier-test-"));
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
                    candidateId: "repeatable-migration-candidate",
                    packageDigest: "a".repeat(64),
                    verificationDigest: "b".repeat(64),
                },
                new AbortController().signal,
            );
            const verifier = createPostgresMigrationVerifier({ packageTempRoot });
            try {
                const fixture = await migrationExecutionFixture(
                    lease.credential,
                    await repeatableMigrationPackageFixture(),
                );
                const [result] = await verifier.verify(fixture.input, new AbortController().signal);

                expect(result?.observations.freshTarget.status).toBe("passed");
                expect(result?.observations.migratedTarget.status).toBe("passed");
                expect(result?.observations.equivalence).toMatchObject({ status: "passed", equivalent: true });
                expect(result?.observations.ledger).toEqual({
                    status: "not-applicable",
                    evidenceDigests: [],
                    diagnosticCodes: [],
                    rows: [],
                });
                expect(result?.observations.replay).toMatchObject({
                    status: "passed",
                    unchanged: true,
                    ledgerRowsBefore: 0,
                    ledgerRowsAfterFirstRun: 0,
                    ledgerRowsAfterReplay: 0,
                });
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
