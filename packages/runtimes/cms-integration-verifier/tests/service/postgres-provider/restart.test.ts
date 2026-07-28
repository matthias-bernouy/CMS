import { expect, test } from "bun:test";
import { SQL } from "bun";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { POSTGRES_DEDICATED_CLUSTER_CONTRACT } from "../../../src/runtime/providers/postgres/fingerprint";
import { disposablePostgresAvailable, startDisposablePostgres } from "../postgresFixture";
import { replaceDisposablePostgresContainer } from "./restartFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "reinitializes after an isolated tmpfs PostgreSQL restart without retaining stale ownership",
    async () => {
        const postgres = await startDisposablePostgres();
        let proxy: ReturnType<typeof Bun.spawn> | null = null;
        try {
            await provision(postgres);
            const provider = await createDisposableVerificationDatabaseProviderFromEnv(source(postgres));
            const stale = await provider.acquire(
                { candidateId: "before-restart", packageDigest: "a".repeat(64), verificationDigest: "b".repeat(64) },
                new AbortController().signal,
            );
            const { container: replacement, port: restartedPort } = await replaceDisposablePostgresContainer(
                postgres.port,
                postgres.password,
            );
            await waitForPostgres(postgres, restartedPort, replacement);
            await provision(postgres, restartedPort);
            proxy = Bun.spawn({
                cmd: [
                    "socat",
                    `TCP-LISTEN:${postgres.port},bind=127.0.0.1,reuseaddr,fork`,
                    `TCP:127.0.0.1:${restartedPort}`,
                ],
                stdout: "ignore",
                stderr: "pipe",
            });
            await waitForProbe(provider);

            const current = await provider.acquire(
                { candidateId: "after-restart", packageDigest: "c".repeat(64), verificationDigest: "d".repeat(64) },
                new AbortController().signal,
            );
            expect(current.credential.databaseId).not.toBe(stale.credential.databaseId);
            await stale.release();
            const database = new SQL(current.credential.connectionUri, { max: 1 });
            try {
                expect((await database.unsafe("select 1 as value"))[0]?.value).toBe(1);
            } finally {
                await database.close();
            }
            await current.release();
        } finally {
            proxy?.kill();
            await proxy?.exited;
            await postgres.close();
        }
    },
    60_000,
);

function source(postgres: Awaited<ReturnType<typeof startDisposablePostgres>>) {
    return {
        CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
        CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
        CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
        CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
        CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
    };
}

async function provision(
    postgres: Awaited<ReturnType<typeof startDisposablePostgres>>,
    port = postgres.port,
): Promise<void> {
    const admin = connection(postgres, port);
    try {
        await admin.unsafe(`comment on database postgres is '${POSTGRES_DEDICATED_CLUSTER_CONTRACT}'`);
    } finally {
        await admin.close();
    }
}

async function waitForPostgres(
    postgres: Awaited<ReturnType<typeof startDisposablePostgres>>,
    port: number,
    container: string,
): Promise<void> {
    let lastError = "unknown";
    for (let attempt = 0; attempt < 150; attempt += 1) {
        const admin = connection(postgres, port);
        try {
            await admin.unsafe("select 1");
            await admin.close();
            return;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            await admin.close({ timeout: 0 }).catch(() => undefined);
            await Bun.sleep(100);
        }
    }
    const logs = Bun.spawnSync({ cmd: ["docker", "logs", "--tail", "20", container], stderr: "pipe" });
    throw new Error(
        `Restarted disposable PostgreSQL did not become reachable (${lastError}; port ${port}): ${logs.stderr.toString().trim()}`,
    );
}

async function waitForProbe(
    provider: Awaited<ReturnType<typeof createDisposableVerificationDatabaseProviderFromEnv>>,
): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            await provider.probe(new AbortController().signal);
            return;
        } catch {
            await Bun.sleep(100);
        }
    }
    throw new Error("Disposable PostgreSQL provider did not recover after cluster restart");
}

function connection(postgres: Awaited<ReturnType<typeof startDisposablePostgres>>, port = postgres.port): SQL {
    return new SQL(`postgresql://postgres:${postgres.password}@${postgres.host}:${port}/postgres?sslmode=disable`, {
        max: 1,
    });
}
