import { SQL } from "bun";
import { expect, test } from "bun:test";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { proveBehavioralRlsIsolation } from "../../../src/sandbox/service/postgres/checks/behavioral";
import { DIGEST_A, DIGEST_B } from "../../fixtures/contracts";
import { disposablePostgresAvailable, startDisposablePostgres } from "../postgresFixture";
import { BEHAVIORAL_PROBE, installBehavioralRuntime, installTenantTable, makePoliciesLeaky } from "./behavioralFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "proves tenant isolation with realistic Supabase actors and rejects cross-tenant access",
    async () => {
        const postgres = await startDisposablePostgres();
        const provider = await createDisposableVerificationDatabaseProviderFromEnv({
            CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
            CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
            CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
            CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
            CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
        });
        const lease = await provider.acquire(
            { candidateId: "behavioral", packageDigest: DIGEST_A, verificationDigest: DIGEST_B },
            new AbortController().signal,
        );
        const database = new SQL(lease.credential.connectionUri, { max: 1 });
        const target = new URL(lease.credential.connectionUri);
        const admin = new SQL(
            `postgresql://postgres:${encodeURIComponent(postgres.password)}@${postgres.host}:${postgres.port}/${lease.credential.databaseId}?sslmode=disable`,
            { max: 1 },
        );
        try {
            const unavailable = await proveBehavioralRlsIsolation(
                database,
                [BEHAVIORAL_PROBE],
                new AbortController().signal,
            );
            expect(unavailable.environment.outcome).toBe("failed");
            expect(codes(unavailable.environment)).toEqual(
                expect.arrayContaining([
                    "postgres-rls-behavior-auth-helper-invalid",
                    "postgres-rls-behavior-role-unavailable",
                ]),
            );

            await installBehavioralRuntime(admin, decodeURIComponent(target.username));
            await installTenantTable(database);
            const safe = await proveBehavioralRlsIsolation(database, [BEHAVIORAL_PROBE], new AbortController().signal);
            expect(safe.environment.outcome).toBe("passed");
            expect(codes(safe.reads)).toEqual([]);
            expect(codes(safe.writes)).toEqual([]);
            expect(safe.reads.outcome).toBe("passed");
            expect(safe.writes.outcome).toBe("passed");
            expect(await rowCount(database)).toBe(0);

            await makePoliciesLeaky(database);
            const leaky = await proveBehavioralRlsIsolation(database, [BEHAVIORAL_PROBE], new AbortController().signal);
            expect(leaky.environment.outcome).toBe("passed");
            expect(leaky.reads.outcome).toBe("failed");
            expect(codes(leaky.reads)).toEqual(
                expect.arrayContaining(["postgres-rls-anon-read", "postgres-rls-cross-tenant-read"]),
            );
            expect(leaky.writes.outcome).toBe("failed");
            expect(codes(leaky.writes)).toEqual(
                expect.arrayContaining([
                    "postgres-rls-cross-tenant-delete",
                    "postgres-rls-cross-tenant-insert",
                    "postgres-rls-cross-tenant-update",
                    "postgres-rls-owner-reassignment",
                ]),
            );
            expect(await rowCount(database)).toBe(0);
        } finally {
            await database.close();
            await admin.close();
            await lease.release();
            await postgres.close();
        }
    },
    30_000,
);

function codes(check: Awaited<ReturnType<typeof proveBehavioralRlsIsolation>>["reads"]): string[] {
    return check.findings.map(({ code }) => code).toSorted();
}

async function rowCount(database: SQL): Promise<number> {
    const rows = (await database.unsafe(
        "select count(*)::integer as count from verifier_behavioral.tenant_records",
    )) as Array<{ count: number }>;
    return rows[0]?.count ?? -1;
}
