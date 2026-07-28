import { expect, test } from "bun:test";
import { SQL } from "bun";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { POSTGRES_DEDICATED_CLUSTER_CONTRACT } from "../../../src/runtime/providers/postgres/fingerprint";
import { DIGEST_A, DIGEST_B } from "../../fixtures/contracts";
import { disposablePostgresAvailable, startDisposablePostgres } from "../postgresFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "forces safe startup settings after candidate ALTER ROLE persistence",
    async () => {
        const postgres = await startDisposablePostgres();
        const admin = new SQL(
            `postgresql://postgres:${postgres.password}@${postgres.host}:${postgres.port}/postgres?sslmode=disable`,
            { max: 1 },
        );
        try {
            await admin.unsafe(`comment on database postgres is '${POSTGRES_DEDICATED_CLUSTER_CONTRACT}'`);
            const provider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            const lease = await provider.acquire(
                { candidateId: "role-settings", packageDigest: DIGEST_A, verificationDigest: DIGEST_B },
                new AbortController().signal,
            );
            const role = decodeURIComponent(new URL(lease.credential.connectionUri).username);
            const candidate = new SQL(lease.credential.connectionUri, { max: 1 });
            try {
                await candidate.unsafe(`alter role "${role}" set statement_timeout = '0'`);
                await candidate.unsafe(`alter role "${role}" set work_mem = '1GB'`);
            } finally {
                await candidate.close();
            }
            const nextPhase = new SQL(lease.credential.connectionUri, { max: 1 });
            try {
                const settings = (await nextPhase.unsafe(`select
                  extract(epoch from current_setting('statement_timeout')::interval) * 1000 as timeout,
                  pg_catalog.pg_size_bytes(current_setting('work_mem'))::text as "workMem"`)) as Array<{
                    timeout: number;
                    workMem: string;
                }>;
                expect(Number(settings[0]?.timeout)).toBe(120_000);
                expect(settings[0]?.workMem).toBe(String(16 * 1024 * 1024));
            } finally {
                await nextPhase.close();
            }
            await expect(provider.probe(new AbortController().signal)).rejects.toThrow(/role settings changed/u);
            await lease.release();
        } finally {
            await admin.close().catch(() => undefined);
            await postgres.close();
        }
    },
    30_000,
);
