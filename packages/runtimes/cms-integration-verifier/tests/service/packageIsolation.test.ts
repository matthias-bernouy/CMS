import { SQL } from "bun";
import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../src/runtime/providers/postgres";
import { createPostgresInstallAndReapplyAdapter } from "../../src/sandbox/service/postgresAdapter";
import { DIGEST_A, DIGEST_B } from "../fixtures/contracts";
import { disposablePostgresAvailable, startDisposablePostgres } from "./postgresFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "isolates exact package digests for one kind and bounds and clears materialized roots",
    async () => {
        const postgres = await startDisposablePostgres();
        const tempRoot = await mkdtemp(join(tmpdir(), "cms-verifier-package-cache-"));
        const adapter = createPostgresInstallAndReapplyAdapter({ packageTempRoot: tempRoot, maxCachedPackages: 2 });
        try {
            const provider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            const lease = await provider.acquire(
                { candidateId: "candidate-1", packageDigest: DIGEST_A, verificationDigest: DIGEST_B },
                new AbortController().signal,
            );
            try {
                const signal = new AbortController().signal;
                const first = await adapter.applyPackageSql(
                    { package: packageFixture("verifier_first"), database: lease.credential, phase: "install" },
                    signal,
                );
                const second = await adapter.applyPackageSql(
                    { package: packageFixture("verifier_second"), database: lease.credential, phase: "install" },
                    signal,
                );
                expect(first.observedSchemaDigest).not.toBe(second.observedSchemaDigest);
                expect(await namespaces(lease.credential.connectionUri)).toEqual(["verifier_first", "verifier_second"]);
                await expect(
                    adapter.applyPackageSql(
                        { package: packageFixture("verifier_third"), database: lease.credential, phase: "install" },
                        signal,
                    ),
                ).rejects.toThrow(/exact identity limit/);
            } finally {
                await adapter.dispose?.();
                await adapter.dispose?.();
                expect(await readdir(tempRoot)).toEqual([]);
                await lease.release();
            }
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
            await postgres.close();
        }
    },
    30_000,
);

async function namespaces(connectionUri: string): Promise<readonly string[]> {
    const database = new SQL(connectionUri, { max: 1 });
    try {
        const rows = (await database.unsafe(
            "select nspname::text as name from pg_catalog.pg_namespace where nspname like 'verifier_%' order by nspname",
        )) as Array<{ name: string }>;
        return rows.map(({ name }) => name);
    } finally {
        await database.close();
    }
}

function packageFixture(namespace: string): IntegrationPackageEnvelopeV1 {
    return {
        schema: "cms.integration.package.v1",
        kind: "same-kind",
        version: "1.2.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": {
                encoding: "utf8",
                content: JSON.stringify({
                    kind: "same-kind",
                    label: "Same kind",
                    version: "1.2.0",
                    inputs: [],
                    connectors: [
                        {
                            provider: "supabase",
                            root: "connectors/supabase",
                            schemas: [{ manifest: "sql/schema.manifest.json" }],
                            compatibility: { schema: { namespaces: [{ name: namespace, relations: [] }] } },
                        },
                    ],
                }),
            },
            "release-notes.md": { encoding: "utf8", content: `Exact package ${namespace}` },
            "connectors/supabase/sql/schema.manifest.json": {
                encoding: "utf8",
                content: JSON.stringify({
                    schema: "cms.integration.sql-bundle.v1",
                    transaction: "atomic",
                    entries: [{ file: "schema.sql" }],
                }),
            },
            "connectors/supabase/sql/schema.sql": {
                encoding: "utf8",
                content: `create schema if not exists ${namespace};`,
            },
        },
    };
}
