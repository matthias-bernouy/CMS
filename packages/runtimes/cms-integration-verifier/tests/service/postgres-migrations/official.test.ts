import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../src/runtime/providers/postgres";
import { createPostgresMigrationVerifier } from "../../../src/sandbox/service/postgres/migrations";
import { disposablePostgresAvailable } from "../postgresFixture";
import { startMigrationPostgres } from "./fixture/harness";
import { migrationExecutionFixture } from "./fixture/input";
import type { MigrationPackageFixture } from "./fixture/packages";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "proves the exact official Photo Albums 1.0.0 to 1.1.0 migration from transported envelopes",
    async () => {
        const release = await officialPhotoAlbumsRelease();
        const postgres = await startMigrationPostgres();
        const packageTempRoot = await mkdtemp(join(tmpdir(), "cms-official-migration-verifier-"));
        try {
            const provider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            const lease = await provider.acquire(
                {
                    candidateId: "photo-albums-1-1-0",
                    packageDigest: release.target.digest,
                    verificationDigest: "f".repeat(64),
                },
                new AbortController().signal,
            );
            const verifier = createPostgresMigrationVerifier({ packageTempRoot });
            try {
                const fixture = await migrationExecutionFixture(lease.credential, release);
                const [result] = await verifier.verify(fixture.input, new AbortController().signal);

                expect(result?.observations.freshTarget.status).toBe("passed");
                expect(result?.observations.migratedTarget.status).toBe("passed");
                expect(result?.observations.equivalence).toMatchObject({ status: "passed", equivalent: true });
                expect(result?.observations.replay).toMatchObject({
                    status: "passed",
                    unchanged: true,
                    ledgerRowsBefore: 0,
                    ledgerRowsAfterFirstRun: 1,
                    ledgerRowsAfterReplay: 1,
                });
                expect(result?.observations.ledger).toMatchObject({
                    status: "passed",
                    freshBaselineRecorded: true,
                    migrationAndLedgerAtomic: true,
                    checksumMismatchRejected: true,
                    emptyLedgerRejected: true,
                    rows: [
                        expect.objectContaining({
                            migrationId: "add-photo-credit",
                            sourcePackageDigest: release.source.digest,
                            targetPackageDigest: release.target.digest,
                        }),
                    ],
                });
                expect(result?.observations.equivalence.diagnosticCodes).toEqual([
                    "database-clock-default-projection-applied",
                    "edge-functions-not-covered",
                    "edge-functions-not-executed",
                    "sql-schema-and-data-equivalence",
                ]);
                expect(result?.observations.freshTarget.dataDigest).toBeDefined();
                expect(result?.observations.freshTarget.diagnosticCodes).toContain("edge-functions-not-executed");
                expect(result?.observations.freshTarget.functionDigests).toEqual([]);
                expect(result?.observations.failureInjections).toEqual([]);
            } finally {
                await verifier.dispose();
                await lease.release();
            }
        } finally {
            await rm(packageTempRoot, { recursive: true, force: true });
            await postgres.close();
        }
    },
    90_000,
);

async function officialPhotoAlbumsRelease(): Promise<MigrationPackageFixture> {
    const packages = await buildOfficialIntegrationPackages();
    const source = requiredPackage(packages, "1.0.0");
    const target = requiredPackage(packages, "1.1.0");
    const connector = target.definition.connectors?.find(({ provider }) => provider === "supabase");
    if (
        !connector?.connectorKey ||
        !connector.lineageId ||
        connector.migrationRevision === undefined ||
        !connector.migration
    ) {
        throw new Error("Official Photo Albums target connector is not migration-aware");
    }
    const sourceMapping = connector.migration.supportedSources.find(
        ({ legacyAdoption }) =>
            legacyAdoption?.definitionVersion === source.version && legacyAdoption.packageDigest === source.digest,
    );
    if (!sourceMapping) {
        throw new Error("Official Photo Albums source is not bound by exact legacy adoption");
    }
    return {
        source: { digest: source.digest, envelope: source.package.envelope },
        target: { digest: target.digest, envelope: target.package.envelope },
        targetPlan: connector.migration,
        connectorKey: connector.connectorKey,
        lineageId: connector.lineageId,
        sourceMigrationRevision: sourceMapping.migrationRevision,
        targetMigrationRevision: connector.migrationRevision,
    };
}

function requiredPackage(packages: Awaited<ReturnType<typeof buildOfficialIntegrationPackages>>, version: string) {
    const value = packages.find(
        ({ kind, version: candidateVersion }) => kind === "photo-albums" && candidateVersion === version,
    );
    if (!value) {
        throw new Error(`Official Photo Albums ${version} package is missing`);
    }
    return value;
}
