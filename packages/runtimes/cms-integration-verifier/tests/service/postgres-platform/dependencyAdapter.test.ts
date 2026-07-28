import { SQL } from "bun";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { createPostgresPlatformVerificationAdapter } from "../../../src/sandbox/service/postgres";
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
import { applicablePlatformSuites } from "./fixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "binds exact minimum and stable dependency execution into production adapter evidence",
    async () => {
        const postgres = await startDisposablePostgres();
        const tempRoot = await mkdtemp(join(tmpdir(), "cms-verifier-dependency-adapter-"));
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
                { candidateId: "dependency-adapter", packageDigest: DIGEST_A, verificationDigest: DIGEST_B },
                new AbortController().signal,
            );
            const adapter = createPostgresPlatformVerificationAdapter({ packageTempRoot: tempRoot });
            try {
                const packages = [
                    await exactDependencyPackage(dependencySqlPackage("1.0.0", "minimum"), "minimum"),
                    await exactDependencyPackage(dependencySqlPackage("1.2.0", "stable"), "stable"),
                ];
                const suite = (await applicablePlatformSuites()).find(
                    ({ suiteId }) => suiteId === "platform-dependency-matrix",
                )!;
                const result = await adapter.verifyPackage(
                    {
                        package: dependencyCandidatePackage(),
                        dependencies: packages.map(({ selection, kind, version, packageDigest }) => ({
                            selection,
                            kind,
                            version,
                            packageDigest,
                        })),
                        dependencyPackages: packages,
                        database: lease.credential,
                        platformSuites: [suite],
                    },
                    new AbortController().signal,
                );

                expect(result.suites).toHaveLength(1);
                expect(result.suites[0]?.outcome).toBe("passed");
                const checks = new Map(result.suites[0]?.checks.map((check) => [check.checkId, check]));
                expect([...checks.values()].map(({ outcome }) => outcome)).toEqual(["passed", "passed", "passed"]);
                expect(checks.get("minimum-package-execution")?.observationDigest).not.toBe(
                    checks.get("stable-package-execution")?.observationDigest,
                );

                const database = new SQL(lease.credential.connectionUri, { max: 1 });
                try {
                    const rows = (await database.unsafe(
                        "select value::text as value from dependency_order.probe",
                    )) as Array<{ value: string }>;
                    expect(rows).toEqual([{ value: "stable" }]);
                } finally {
                    await database.close();
                }
            } finally {
                await adapter.dispose?.();
                await lease.release();
            }
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
            await postgres.close();
        }
    },
    45_000,
);
