import { expect, test } from "bun:test";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { createPostgresMigrationVerifier } from "../../../src/sandbox/service/postgres/migrations";
import { disposablePostgresAvailable } from "../postgresFixture";
import { startMigrationPostgres } from "./fixture/harness";
import { migrationExecutionFixture } from "./fixture/input";
import { MIGRATION_SQL, migrationPackageFixture } from "./fixture/packages";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "discards untrusted temporary session state between migration proof runs",
    async () => {
        const postgres = await startMigrationPostgres();
        try {
            const provider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            const lease = await provider.acquire(
                { candidateId: "session-reset", packageDigest: "a".repeat(64), verificationDigest: "b".repeat(64) },
                new AbortController().signal,
            );
            const verifier = createPostgresMigrationVerifier({});
            try {
                const release = await migrationPackageFixture(`${MIGRATION_SQL}
CREATE TEMPORARY TABLE verifier_temporary_state (value integer);
LISTEN verifier_candidate_channel;
SELECT pg_catalog.pg_advisory_lock(873421);
`);
                const fixture = await migrationExecutionFixture(lease.credential, release);
                const [result] = await verifier.verify(fixture.input, new AbortController().signal);

                expect(result?.observations.equivalence.status).toBe("passed");
                expect(result?.observations.ledger.status).toBe("passed");
                expect(result?.observations.replay.status).toBe("passed");
            } finally {
                await verifier.dispose();
                await lease.release();
            }
        } finally {
            await postgres.close();
        }
    },
    60_000,
);

postgresTest(
    "fails closed when candidate SQL persists role-wide default privileges",
    async () => {
        const postgres = await startMigrationPostgres();
        try {
            const provider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            const lease = await provider.acquire(
                { candidateId: "default-acl", packageDigest: "c".repeat(64), verificationDigest: "d".repeat(64) },
                new AbortController().signal,
            );
            const verifier = createPostgresMigrationVerifier({});
            try {
                const release = await migrationPackageFixture(`${MIGRATION_SQL}
ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO anon;
`);
                const fixture = await migrationExecutionFixture(lease.credential, release);

                await expect(verifier.verify(fixture.input, new AbortController().signal)).rejects.toThrow(
                    /persistent role default privileges/u,
                );
            } finally {
                await verifier.dispose();
                await lease.release();
            }
        } finally {
            await postgres.close();
        }
    },
    60_000,
);
