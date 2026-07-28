import { SQL } from "bun";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MigrationVerificationEnvironmentV1 } from "@bernouy/cms-integration-verification";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { createPostgresMigrationVerifier } from "../../../src/sandbox/service/postgres/migrations";
import { disposablePostgresAvailable, startDisposablePostgres } from "../postgresFixture";
import { startMigrationPostgres } from "./fixture/harness";
import { migrationExecutionFixture } from "./fixture/input";

const postgresTest = disposablePostgresAvailable ? test : test.skip;
const mismatch = /does not match the attested PostgreSQL contract/u;

postgresTest(
    "rejects every declared PostgreSQL environment substitution before producing migration evidence",
    async () => {
        const postgres = await startMigrationPostgres();
        const packageTempRoot = await mkdtemp(join(tmpdir(), "cms-migration-environment-test-"));
        try {
            const provider = await providerFor(postgres);
            const lease = await provider.acquire(identity("declared-environment"), new AbortController().signal);
            const verifier = createPostgresMigrationVerifier({ packageTempRoot });
            try {
                const mutations: Array<
                    (environment: MigrationVerificationEnvironmentV1) => MigrationVerificationEnvironmentV1
                > = [
                    (environment) => ({
                        ...environment,
                        postgres: { ...environment.postgres, version: "16.13" },
                    }),
                    (environment) => ({
                        ...environment,
                        postgres: { ...environment.postgres, imageDigest: `sha256:${"a".repeat(64)}` },
                    }),
                    (environment) => ({ ...environment, bootstrapSqlDigest: "b".repeat(64) }),
                    (environment) => ({ ...environment, grants: [] }),
                    (environment) => ({
                        ...environment,
                        roles: environment.roles.map((role) =>
                            role.name === "anon" ? { ...role, attributes: ["bypassrls", "no-login"] } : role,
                        ),
                    }),
                    (environment) => ({
                        ...environment,
                        extensions: [{ name: "pgcrypto", version: "1.2" }],
                    }),
                    (environment) => ({
                        ...environment,
                        sessionSettings: [{ name: "search_path", value: "public" }],
                    }),
                ];
                for (const mutate of mutations) {
                    const fixture = await migrationExecutionFixture(lease.credential, undefined, mutate);
                    await expect(verifier.verify(fixture.input, new AbortController().signal)).rejects.toThrow(
                        mismatch,
                    );
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
    "rejects a substituted auth helper before migration evidence is produced",
    async () => {
        const postgres = await startMigrationPostgres();
        try {
            const provider = await providerFor(postgres);
            const lease = await provider.acquire(identity("auth-helper-substitution"), new AbortController().signal);
            const adminTarget = new URL(lease.credential.connectionUri);
            adminTarget.username = "postgres";
            adminTarget.password = postgres.password;
            adminTarget.searchParams.delete("options");
            const admin = new SQL(adminTarget.toString(), { max: 1 });
            const verifier = createPostgresMigrationVerifier({});
            try {
                await admin.unsafe(`create or replace function auth.uid() returns uuid
                    language sql stable security invoker as $$ select null::uuid $$`);
                const fixture = await migrationExecutionFixture(lease.credential);
                await expect(verifier.verify(fixture.input, new AbortController().signal)).rejects.toThrow(mismatch);
            } finally {
                await verifier.dispose();
                await admin.close();
                await lease.release();
            }
        } finally {
            await postgres.close();
        }
    },
    30_000,
);

postgresTest(
    "rejects a session whose observed search path no longer matches the approved environment",
    async () => {
        const postgres = await startMigrationPostgres();
        try {
            const provider = await providerFor(postgres);
            const lease = await provider.acquire(identity("observed-environment"), new AbortController().signal);
            const connection = new URL(lease.credential.connectionUri);
            const options = connection.searchParams.get("options") ?? "";
            const substituted = options.replace("-csearch_path=public,extensions", "-csearch_path=public");
            if (substituted === options) {
                throw new Error("Disposable PostgreSQL search path option is missing");
            }
            connection.searchParams.set("options", substituted);
            const verifier = createPostgresMigrationVerifier({});
            try {
                const fixture = await migrationExecutionFixture({
                    ...lease.credential,
                    connectionUri: connection.toString(),
                });
                await expect(verifier.verify(fixture.input, new AbortController().signal)).rejects.toThrow(mismatch);
            } finally {
                await verifier.dispose();
                await lease.release();
            }
        } finally {
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

function identity(candidateId: string) {
    return { candidateId, packageDigest: "a".repeat(64), verificationDigest: "b".repeat(64) };
}
