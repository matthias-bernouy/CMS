import { expect, test } from "bun:test";
import { SQL } from "bun";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { POSTGRES_DEDICATED_CLUSTER_CONTRACT } from "../../../src/runtime/providers/postgres/fingerprint";
import {
    POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION,
    recoverDisposablePostgresObjects,
} from "../../../src/runtime/providers/postgres/recovery";
import { disposablePostgresAvailable, startDisposablePostgres } from "../postgresFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "binds destructive cleanup to an instance, job, server fingerprint, and explicit confirmation",
    async () => {
        const postgres = await startDisposablePostgres();
        const admin = adminConnection(postgres);
        try {
            const provider = await providerFor(postgres);
            await provider.probe(new AbortController().signal);
            const identity = {
                candidateId: "owned-candidate",
                packageDigest: "a".repeat(64),
                verificationDigest: "b".repeat(64),
            };
            const lease = await provider.acquire(identity, new AbortController().signal);
            const rows = (await admin.unsafe(`select database_name::text as database, role_name::text as role,
              server_fingerprint::text as fingerprint, instance_id::text as instance, job_digest::text as job,
              lease_token::text as "leaseToken", fencing_token::text as fence, state::text as state,
              database_oid::int as "databaseOid", role_oid::int as "roleOid"
              from cms_verifier_provider.owned_leases`)) as Array<Record<string, string>>;
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ database: lease.credential.databaseId });
            expect(rows[0]?.role).toMatch(/^cmsv_[a-f0-9]{24}$/u);
            expect(rows[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
            expect(rows[0]?.instance).toMatch(/^[a-f0-9]{32}$/u);
            expect(rows[0]?.job).toMatch(/^[a-f0-9]{64}$/u);
            expect(rows[0]?.leaseToken).toMatch(/^[a-f0-9]{64}$/u);
            expect(rows[0]?.fence).toMatch(/^[1-9]\d*$/u);
            expect(rows[0]?.state).toBe("ready");
            expect(Number(rows[0]?.databaseOid)).toBeGreaterThan(0);
            expect(Number(rows[0]?.roleOid)).toBeGreaterThan(0);

            await expect(
                recoverDisposablePostgresObjects(admin, {
                    confirmation: "not-confirmed" as typeof POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION,
                    serverFingerprint: rows[0]!.fingerprint,
                }),
            ).rejects.toThrow(/not explicitly confirmed/u);
            expect(await databaseCount(admin, lease.credential.databaseId)).toBe(1);

            await lease.release();
            expect(await databaseCount(admin, lease.credential.databaseId)).toBe(0);
            expect((await admin.unsafe("select 1 from cms_verifier_provider.owned_leases")).length).toBe(0);
        } finally {
            await admin.close().catch(() => undefined);
            await postgres.close();
        }
    },
    30_000,
);

postgresTest(
    "fails closed without deleting a prefixed database that has no ownership marker",
    async () => {
        const postgres = await startDisposablePostgres();
        const admin = adminConnection(postgres);
        const suffix = "1".repeat(24);
        const role = `cmsv_${suffix}`;
        const database = `cmscore_contracts_${suffix}`;
        try {
            await admin.unsafe(`create role "${role}" nologin`);
            await admin.unsafe(`create database "${database}" owner "${role}"`);

            await expect(providerFor(postgres)).rejects.toThrow(/unmarked destructive target/u);
            expect(await databaseCount(admin, database)).toBe(1);
            const roles = await admin.unsafe("select 1 from pg_catalog.pg_roles where rolname = $1", [role]);
            expect(roles.length).toBe(1);
        } finally {
            await admin.close().catch(() => undefined);
            await postgres.close();
        }
    },
    30_000,
);

postgresTest(
    "fails closed when a stored ownership marker names another server fingerprint",
    async () => {
        const postgres = await startDisposablePostgres();
        const admin = adminConnection(postgres);
        try {
            const provider = await providerFor(postgres);
            const lease = await provider.acquire(
                { candidateId: "fingerprint", packageDigest: "c".repeat(64), verificationDigest: "d".repeat(64) },
                new AbortController().signal,
            );
            await admin.unsafe(
                `update cms_verifier_provider.owned_leases set server_fingerprint = $1 where database_name = $2`,
                ["f".repeat(64), lease.credential.databaseId],
            );

            await expect(providerFor(postgres)).rejects.toThrow(/server fingerprint does not match/u);
            expect(await databaseCount(admin, lease.credential.databaseId)).toBe(1);
        } finally {
            await admin.close().catch(() => undefined);
            await postgres.close();
        }
    },
    30_000,
);

postgresTest(
    "exposes a non-destructive probe that rejects shared-role contract drift",
    async () => {
        const postgres = await startDisposablePostgres();
        const admin = adminConnection(postgres);
        try {
            const provider = await providerFor(postgres);
            await provider.probe(new AbortController().signal);
            await admin.unsafe("alter role anon login");

            await expect(provider.probe(new AbortController().signal)).rejects.toThrow(/shared roles/u);
        } finally {
            await admin.close().catch(() => undefined);
            await postgres.close();
        }
    },
    30_000,
);

async function providerFor(postgres: Awaited<ReturnType<typeof startDisposablePostgres>>) {
    const admin = adminConnection(postgres);
    try {
        await admin.unsafe(`comment on database postgres is '${POSTGRES_DEDICATED_CLUSTER_CONTRACT}'`);
    } finally {
        await admin.close();
    }
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

async function databaseCount(admin: SQL, database: string): Promise<number> {
    const rows = (await admin.unsafe("select count(*)::int as count from pg_catalog.pg_database where datname = $1", [
        database,
    ])) as Array<{ count: number }>;
    return rows[0]?.count ?? -1;
}
