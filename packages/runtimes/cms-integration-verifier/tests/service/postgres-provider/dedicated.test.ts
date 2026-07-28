import { expect, test } from "bun:test";
import { SQL } from "bun";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { disposablePostgresAvailable, startDisposablePostgres } from "../postgresFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "refuses an arbitrary matching PostgreSQL before any global mutation",
    async () => {
        const postgres = await startDisposablePostgres();
        const admin = new SQL(
            `postgresql://postgres:${postgres.password}@${postgres.host}:${postgres.port}/postgres?sslmode=disable`,
            { max: 1 },
        );
        try {
            await expect(
                createDisposableVerificationDatabaseProviderFromEnv({
                    CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                    CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                    CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                    CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                    CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
                }),
            ).rejects.toThrow(/not explicitly provisioned/u);
            const state = (await admin.unsafe(`select
              exists(select 1 from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role'))
                as "sharedRoles",
              exists(select 1 from pg_catalog.pg_namespace where nspname = 'cms_verifier_provider') as store,
              has_database_privilege('public', current_database(), 'connect') as "publicConnect"`)) as Array<{
                sharedRoles: boolean;
                store: boolean;
                publicConnect: boolean;
            }>;
            expect(state[0]).toEqual({ sharedRoles: false, store: false, publicConnect: true });
        } finally {
            await admin.close().catch(() => undefined);
            await postgres.close();
        }
    },
    30_000,
);
