import { expect, test } from "bun:test";
import { SQL } from "bun";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import {
    POSTGRES_DEDICATED_CLUSTER_CONTRACT,
    readPostgresServerFingerprint,
} from "../../../src/runtime/providers/postgres/fingerprint";
import { POSTGRES_OWNERSHIP_CONTRACT } from "../../../src/runtime/providers/postgres/ownership";
import { disposablePostgresAvailable, startDisposablePostgres } from "../postgresFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "recovers both marker-before-create and database-create-before-bind crash boundaries",
    async () => {
        const postgres = await startDisposablePostgres();
        const admin = adminConnection(postgres);
        try {
            await provision(admin);
            await providerFor(postgres);
            const suffix = "1".repeat(24);
            const fingerprint = await readPostgresServerFingerprint(admin);
            await admin.unsafe(
                `insert into cms_verifier_provider.owned_leases
                  (database_name, role_name, server_fingerprint, instance_id, lease_token, job_digest,
                    state, ownership_contract, lease_expires_at)
                  values ($1, $2, $3, $4, $5, $6, 'reserved', $7,
                    clock_timestamp() - interval '1 second')`,
                [
                    `cmscore_contracts_${suffix}`,
                    `cmsv_${suffix}`,
                    fingerprint,
                    "1".repeat(32),
                    "2".repeat(64),
                    "3".repeat(64),
                    POSTGRES_OWNERSHIP_CONTRACT,
                ],
            );
            await providerFor(postgres);
            expect(await journalCount(admin)).toBe(0);

            const owner = await providerFor(postgres);
            const lease = await owner.acquire(
                {
                    candidateId: "create-boundary",
                    packageDigest: "a".repeat(64),
                    verificationDigest: "b".repeat(64),
                },
                new AbortController().signal,
            );
            await admin.unsafe(`comment on database "${lease.credential.databaseId}" is null`);
            await admin.unsafe(
                `update cms_verifier_provider.owned_leases set state = 'role-created', database_oid = null,
                  lease_expires_at = clock_timestamp() - interval '1 second'
                  where database_name = $1`,
                [lease.credential.databaseId],
            );
            await providerFor(postgres);
            expect(await databaseCount(admin, lease.credential.databaseId)).toBe(0);
            expect(await journalCount(admin)).toBe(0);
            await lease.release();
        } finally {
            await admin.close().catch(() => undefined);
            await postgres.close();
        }
    },
    30_000,
);

postgresTest(
    "fails closed when an unbound create-boundary database has foreign provenance",
    async () => {
        const postgres = await startDisposablePostgres();
        const admin = adminConnection(postgres);
        try {
            await provision(admin);
            const owner = await providerFor(postgres);
            const lease = await owner.acquire(
                { candidateId: "foreign", packageDigest: "c".repeat(64), verificationDigest: "d".repeat(64) },
                new AbortController().signal,
            );
            await admin.unsafe(`comment on database "${lease.credential.databaseId}" is 'foreign-object'`);
            await admin.unsafe(
                `update cms_verifier_provider.owned_leases set state = 'role-created', database_oid = null,
                  lease_expires_at = clock_timestamp() - interval '1 second' where database_name = $1`,
                [lease.credential.databaseId],
            );
            await expect(providerFor(postgres)).rejects.toThrow(/not a recoverable create boundary/u);
            expect(await databaseCount(admin, lease.credential.databaseId)).toBe(1);
        } finally {
            await admin.close().catch(() => undefined);
            await postgres.close();
        }
    },
    30_000,
);

async function providerFor(postgres: Awaited<ReturnType<typeof startDisposablePostgres>>) {
    return await createDisposableVerificationDatabaseProviderFromEnv({
        CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
        CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
        CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
        CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
        CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
    });
}

function adminConnection(postgres: Awaited<ReturnType<typeof startDisposablePostgres>>): SQL {
    return new SQL(
        `postgresql://postgres:${postgres.password}@${postgres.host}:${postgres.port}/postgres?sslmode=disable`,
        { max: 1 },
    );
}

async function provision(admin: SQL): Promise<void> {
    await admin.unsafe(`comment on database postgres is '${POSTGRES_DEDICATED_CLUSTER_CONTRACT}'`);
}

async function journalCount(admin: SQL): Promise<number> {
    return Number(
        (await admin.unsafe("select count(*)::int as count from cms_verifier_provider.owned_leases"))[0]?.count,
    );
}

async function databaseCount(admin: SQL, database: string): Promise<number> {
    return Number(
        (
            await admin.unsafe("select count(*)::int as count from pg_catalog.pg_database where datname = $1", [
                database,
            ])
        )[0]?.count,
    );
}
