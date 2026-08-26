import { afterEach, describe, expect, test } from "bun:test";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    identifyOfficialRepositoryBootstrapPlan,
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationRegistryCatalogSnapshotReference,
} from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    FsIntegrationCompatibilityV2ReportStore,
    FsIntegrationMigrationReportStore,
    FsIntegrationVerificationBundleStore,
    FsIntegrationVerificationReportStore,
    FsReleaseAdmissionDecisionStore,
} from "@bernouy/cms-integration-registry/fs";
import { buildOfficialRepositoryBootstrapPlan } from "@bernouy/cms-official-integrations/publication";
import { prepareOfficialRepositoryBootstrap } from "../../src/production";
import { bootstrapRepositoryRegistryIfEmpty, REPOSITORY_BOOTSTRAP_MARKER } from "../../src/registryRoot";
import { TemporaryRoots } from "./fixtures";

const roots = new TemporaryRoots();

afterEach(async () => await roots.cleanup());

describe("official repository bootstrap", () => {
    test("resumes an exact fully committed official plan before removing its marker", async () => {
        const root = await roots.create();
        const plan = await buildOfficialRepositoryBootstrapPlan();
        const identified = await identifyOfficialRepositoryBootstrapPlan(plan);
        const prepared = await prepareOfficialRepositoryBootstrap(root);
        expect(prepared.planDigest).toBe(identified.digest);
        await writeFile(
            join(root, REPOSITORY_BOOTSTRAP_MARKER),
            JSON.stringify({
                planDigest: prepared.planDigest,
                schema: "cms.integration.repository.bootstrap.v2",
                state: "commit-pending",
            }),
        );

        await prepared.commit();
        expect(await bootstrapRepositoryRegistryIfEmpty(root, prepareOfficialRepositoryBootstrap)).toBe("bootstrapped");

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        expect(snapshot.diagnostics).toEqual([]);
        expect(snapshot.health).toBe("healthy");
        expect(snapshot.summaries.map(({ kind }) => kind)).toEqual(
            identified.plan.packages.map(({ package: entry }) => entry.envelope.kind),
        );
        expect(snapshot.summaries).toHaveLength(14);
        const snapshots = new IntegrationRegistryCatalogSnapshotReference(snapshot);
        const mutations = new InMemoryIntegrationRegistryMutationCoordinator();
        const storeConfig = { root, snapshots, mutations };
        const compatibility = new FsIntegrationCompatibilityV2ReportStore(storeConfig);
        const verification = new FsIntegrationVerificationReportStore(storeConfig);
        const migrations = new FsIntegrationMigrationReportStore(storeConfig);
        const decisions = new FsReleaseAdmissionDecisionStore({
            ...storeConfig,
            compatibilityReports: compatibility,
            verificationReports: verification,
            migrationReports: migrations,
        });
        const bundles = new FsIntegrationVerificationBundleStore(root);
        for (const integrationPackage of identified.plan.packages) {
            const backfill = identified.plan.verificationBackfills.find(
                ({ transition }) =>
                    transition.kind === integrationPackage.package.envelope.kind &&
                    transition.version === integrationPackage.package.envelope.version,
            );
            expect(backfill).toBeDefined();
            expect(
                snapshot.locateExactVersion(
                    integrationPackage.package.envelope.kind,
                    integrationPackage.package.envelope.version,
                )?.package.digest,
            ).toBe(integrationPackage.package.digest);
            expect(
                snapshot
                    .getIndex(integrationPackage.package.envelope.kind)
                    ?.versions.find(({ version }) => version === integrationPackage.package.envelope.version)
                    ?.verificationDigest,
            ).toBe(backfill?.verification.digest);
            expect((await bundles.get(backfill!.verification.digest))?.digest).toBe(backfill?.verification.digest);
            expect(
                (await compatibility.get(backfill!.transition.kind, backfill!.transition.version))?.current.origin,
            ).toBe("legacy-backfill");
            expect(
                (await verification.get(backfill!.transition.kind, backfill!.transition.version))?.current.origin,
            ).toBe("legacy-backfill");
            expect(
                (await decisions.get(backfill!.transition.kind, backfill!.transition.version))?.current,
            ).toMatchObject({
                admissible: true,
                packageDigest: integrationPackage.package.digest,
            });
        }
        expect(await readdir(root)).not.toContain(REPOSITORY_BOOTSTRAP_MARKER);
    }, 120_000);
});
