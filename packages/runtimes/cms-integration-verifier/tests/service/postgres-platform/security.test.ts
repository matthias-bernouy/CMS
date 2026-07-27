import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { createPostgresPlatformVerificationAdapter } from "../../../src/sandbox/service/postgres";
import { DIGEST_A, DIGEST_B } from "../../fixtures/contracts";
import {
    disposablePostgresAvailable,
    markDisposablePostgresDedicated,
    startDisposablePostgres,
} from "../postgresFixture";
import { applicablePlatformSuites, unsafePostgresPackage } from "./fixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "reports independent PostgreSQL boundary and security findings from observed state",
    async () => {
        const postgres = await startDisposablePostgres();
        const tempRoot = await mkdtemp(join(tmpdir(), "cms-verifier-adversarial-"));
        const adapter = createPostgresPlatformVerificationAdapter({ packageTempRoot: tempRoot });
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
                { candidateId: "unsafe", packageDigest: DIGEST_A, verificationDigest: DIGEST_B },
                new AbortController().signal,
            );
            try {
                const result = await adapter.verifyPackage(
                    {
                        package: unsafePostgresPackage(),
                        dependencyPackages: [],
                        database: lease.credential,
                        platformSuites: await applicablePlatformSuites(),
                    },
                    new AbortController().signal,
                );
                expect(outcome(result, "platform-postgres-install-reapply")).toBe("passed");
                expect(codes(result, "platform-postgres-owned-roots")).toContain(
                    "postgres-mutation-outside-owned-roots",
                );
                expect(codes(result, "platform-postgres-schema-contract")).toEqual([
                    "postgres-observed-schema-contract-mismatch",
                ]);
                expect(codes(result, "platform-postgres-rls-shape")).toEqual(
                    expect.arrayContaining([
                        "postgres-policy-missing-with-check",
                        "postgres-policy-user-metadata-authorization",
                        "postgres-rls-disabled",
                    ]),
                );
                expect(codes(result, "platform-postgres-grants")).toEqual(
                    expect.arrayContaining([
                        "postgres-data-api-elevated-relation-privilege",
                        "postgres-data-api-schema-create",
                        "postgres-public-object-privilege",
                    ]),
                );
                expect(codes(result, "platform-postgres-view-security")).toEqual([
                    "postgres-view-security-definer-exposure",
                ]);
                expect(codes(result, "platform-postgres-privileged-functions")).toEqual(
                    expect.arrayContaining([
                        "postgres-security-definer-unprivileged-execute",
                        "postgres-security-definer-unsafe-search-path",
                    ]),
                );
            } finally {
                await adapter.dispose?.();
                await lease.release();
            }
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
            await postgres.close();
        }
    },
    30_000,
);

function codes(
    result: Awaited<ReturnType<ReturnType<typeof createPostgresPlatformVerificationAdapter>["verifyPackage"]>>,
    suiteId: string,
): string[] {
    return (
        result.suites
            .find((suite) => suite.suiteId === suiteId)
            ?.checks.flatMap((check) => check.findings.map((finding) => finding.code)) ?? []
    ).toSorted();
}

function outcome(
    result: Awaited<ReturnType<ReturnType<typeof createPostgresPlatformVerificationAdapter>["verifyPackage"]>>,
    suiteId: string,
) {
    return result.suites.find((suite) => suite.suiteId === suiteId)?.outcome;
}
