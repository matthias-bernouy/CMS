import { SQL } from "bun";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { executeExactDependencyMatrices } from "../../../src/sandbox/service/postgres/suites/dependencies";
import { DIGEST_A, DIGEST_B } from "../../fixtures/contracts";
import {
    dependencyCandidatePackage,
    dependencySqlPackage,
    exactDependencyPackage,
} from "../../fixtures/dependencyPackages";
import {
    disposablePostgresAvailable,
    markDisposablePostgresDedicated,
    startDisposablePostgres,
} from "../postgresFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "executes dependency-first minimum and stable graphs on independently reset databases",
    async () => {
        const postgres = await startDisposablePostgres();
        const tempRoot = await mkdtemp(join(tmpdir(), "cms-verifier-dependencies-"));
        try {
            await markDisposablePostgresDedicated(postgres);
            const provider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            const lease = await provider.acquire(
                { candidateId: "dependency-matrix", packageDigest: DIGEST_A, verificationDigest: DIGEST_B },
                new AbortController().signal,
            );
            const database = new SQL(lease.credential.connectionUri, { max: 1 });
            try {
                const candidate = dependencyCandidatePackage(candidateSql());
                const minimum = await exactDependencyPackage(dependencySqlPackage("1.0.0", "minimum"), "minimum");
                const stable = await exactDependencyPackage(dependencySqlPackage("1.2.0", "stable"), "stable");

                const passed = await executeExactDependencyMatrices(
                    {
                        database,
                        databaseId: lease.credential.databaseId,
                        candidate,
                        packages: [minimum, stable],
                        packageTempRoot: tempRoot,
                    },
                    new AbortController().signal,
                );

                expect(passed.map(({ selection, outcome }) => ({ selection, outcome }))).toEqual([
                    { selection: "minimum", outcome: "passed" },
                    { selection: "stable", outcome: "passed" },
                ]);
                expect(passed.map((entry) => entry.packages.map(({ kind, version }) => `${kind}@${version}`))).toEqual([
                    ["foundation@1.0.0"],
                    ["foundation@1.2.0"],
                ]);
                expect(await candidateSchemas(database)).toEqual(["dependency_order", "storage"]);

                const brokenMinimum = await exactDependencyPackage(
                    dependencySqlPackage("1.0.0", "unused", "select missing_dependency_symbol;"),
                    "minimum",
                );
                const failed = await executeExactDependencyMatrices(
                    {
                        database,
                        databaseId: lease.credential.databaseId,
                        candidate,
                        packages: [brokenMinimum, stable],
                        packageTempRoot: tempRoot,
                    },
                    new AbortController().signal,
                );
                expect(failed.map(({ selection, outcome, failure }) => ({ selection, outcome, failure }))).toEqual([
                    {
                        selection: "minimum",
                        outcome: "failed",
                        failure: {
                            code: "dependency-package-sql-rejected",
                            path: "dependencies.minimum.foundation",
                        },
                    },
                    { selection: "stable", outcome: "passed", failure: undefined },
                ]);
                expect(await candidateSchemas(database)).toEqual(["dependency_order", "storage"]);
            } finally {
                await database.close().catch(() => undefined);
                await lease.release();
            }
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
            await postgres.close();
        }
    },
    45_000,
);

function candidateSql(): string {
    return [
        "alter table dependency_order.probe add column candidate_applied boolean not null default true;",
        "create schema candidate_order;",
        "create table candidate_order.probe (value text primary key);",
    ].join("\n");
}

async function candidateSchemas(database: SQL): Promise<string[]> {
    const rows = (await database.unsafe(`select nspname::text as name from pg_catalog.pg_namespace
      where nspowner = (select oid from pg_catalog.pg_roles where rolname = current_user)
      order by nspname collate "C"`)) as Array<{ name: string }>;
    return rows.map(({ name }) => name);
}
