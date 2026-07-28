import { SQL } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../../src/runtime/providers/postgres";
import { POSTGRES_DEDICATED_CLUSTER_CONTRACT } from "../../../../src/runtime/providers/postgres/fingerprint";
import { createPostgresMigrationVerifier } from "../../../../src/sandbox/service/postgres/migrations";
import { startDisposablePostgres, type DisposablePostgresFixture } from "../../postgresFixture";

export async function withMigrationVerifier(
    name: string,
    callback: (context: {
        verifier: ReturnType<typeof createPostgresMigrationVerifier>;
        database: Readonly<{ databaseId: string; connectionUri: string }>;
    }) => Promise<void>,
): Promise<void> {
    const postgres = await startMigrationPostgres();
    const packageTempRoot = await mkdtemp(join(tmpdir(), `${name}-`));
    try {
        const provider = await createDisposableVerificationDatabaseProviderFromEnv({
            CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
            CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
            CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
            CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
            CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
        });
        const lease = await provider.acquire(
            { candidateId: name, packageDigest: "a".repeat(64), verificationDigest: "b".repeat(64) },
            new AbortController().signal,
        );
        const verifier = createPostgresMigrationVerifier({ packageTempRoot });
        try {
            await callback({ verifier, database: lease.credential });
        } finally {
            await verifier.dispose();
            await lease.release();
        }
    } finally {
        await rm(packageTempRoot, { recursive: true, force: true });
        await postgres.close();
    }
}

export async function startMigrationPostgres(): Promise<DisposablePostgresFixture> {
    const postgres = await startDisposablePostgres();
    const admin = new SQL(
        `postgresql://postgres:${postgres.password}@${postgres.host}:${postgres.port}/postgres?sslmode=disable`,
        { max: 1 },
    );
    try {
        await admin.unsafe(`COMMENT ON DATABASE postgres IS '${POSTGRES_DEDICATED_CLUSTER_CONTRACT}'`);
        return postgres;
    } catch (error) {
        await postgres.close();
        throw error;
    } finally {
        await admin.close().catch(() => undefined);
    }
}
