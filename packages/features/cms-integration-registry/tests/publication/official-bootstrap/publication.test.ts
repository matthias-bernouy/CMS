import { afterEach, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { IntegrationCompatibilityEvaluator } from "@bernouy/cms-integration-registry";
import type { ReviewedSchemaBaselineStore } from "@bernouy/cms-integration-registry";
import {
    FsOfficialIntegrationRegistryBootstrapPublisher,
    FsReviewedSchemaBaselineStore,
} from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage } from "../fixtures";
import {
    BASELINE_APPROVAL,
    bootstrapPlan,
    bootstrapPublisher,
    legacySqlPackage,
    registryFixture,
    restartedBootstrapPublisher,
    reviewedBaseline,
} from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("official filesystem registry bootstrap publication", () => {
    test("persists exact reviewed baselines and re-prepares after a process restart", async () => {
        const fixture = registryFixture();
        const integrationPackage = await legacySqlPackage("legacy");
        const baseline = await reviewedBaseline(integrationPackage);
        const plan = bootstrapPlan([integrationPackage], [baseline]);
        await expect(fixture.publisher.publish({ package: integrationPackage })).rejects.toThrow(
            "compatibility.schema",
        );

        const bootstrap = bootstrapPublisher(fixture);
        const preparation = await bootstrap.prepare(plan);
        expect(preparation).toMatchObject({ packageCount: 1, pendingPackageCount: 1, baselineCount: 1 });
        expect(preparation.planDigest).toMatch(/^[a-f0-9]{64}$/u);
        expect(await readdir(fixture.root)).toEqual([]);

        const [published] = await bootstrap.publishPrepared(preparation);
        expect(published).toMatchObject({ kind: "legacy", version: "1.0.0", digest: integrationPackage.digest });
        const store = new FsReviewedSchemaBaselineStore({ root: fixture.root });
        expect((await store.listAll()).map(({ current }) => current)).toEqual([baseline]);

        const restarted = await restartedBootstrapPublisher(fixture.root);
        const resumed = await restarted.prepare(plan);
        expect(resumed).toMatchObject({ planDigest: preparation.planDigest, pendingPackageCount: 0 });
        expect(await restarted.publishPrepared(resumed)).toEqual([]);
    });

    test("validates the entire package and admission plan before writing", async () => {
        const fixture = registryFixture();
        let reports = 0;
        const compatibility = new IntegrationCompatibilityEvaluator({
            identity: { name: "bootstrap-preflight-test", version: "1.0.0" },
            now: () => "2026-07-26T10:00:00.000Z",
            createReportId: () => {
                reports += 1;
                if (reports === 2) {
                    throw new Error("preflight evaluator failure");
                }
                return `report-${reports}`;
            },
        });
        const bootstrap = new FsOfficialIntegrationRegistryBootstrapPublisher({
            root: fixture.root,
            snapshots: fixture.snapshots,
            compatibility,
            mutations: fixture.mutations,
            baselineApproval: BASELINE_APPROVAL,
        });
        const first = await publicationPackage("first", "1.0.0");
        const second = await publicationPackage("second", "1.0.0");

        await expect(bootstrap.prepare(bootstrapPlan([first, second]))).rejects.toThrow("preflight evaluator failure");
        expect(await readdir(fixture.root)).toEqual([]);
    });

    test("fails final validation when baseline persistence is silently swallowed", async () => {
        const fixture = registryFixture();
        const integrationPackage = await legacySqlPackage("legacy");
        const baseline = await reviewedBaseline(integrationPackage);
        const swallowedStore: ReviewedSchemaBaselineStore = {
            get: async () => null,
            listAll: async () => [],
            listForPackage: async () => [],
            append: async () => undefined as never,
        };
        const bootstrap = new FsOfficialIntegrationRegistryBootstrapPublisher({
            root: fixture.root,
            snapshots: fixture.snapshots,
            compatibility: fixture.compatibility,
            mutations: fixture.mutations,
            baselineApproval: BASELINE_APPROVAL,
            baselineStore: swallowedStore,
        });
        const preparation = await bootstrap.prepare(bootstrapPlan([integrationPackage], [baseline]));

        await expect(bootstrap.publishPrepared(preparation)).rejects.toThrow(/did not persist every exact/i);
        expect(fixture.snapshots.current().locateExactVersion("legacy", "1.0.0")?.package.digest).toBe(
            integrationPackage.digest,
        );
    });

    test("rejects missing SQL evidence, dependency drift, and connector selector drift before writing", async () => {
        const fixture = registryFixture();
        const dependency = await publicationPackage("dependency", "1.0.0");
        const dependent = await legacySqlPackage("dependent", "1.0.0", [
            { name: "Dependency", kind: "dependency", versionRange: "^1.0.0" },
        ]);
        const bootstrap = bootstrapPublisher(fixture);

        await expect(bootstrap.prepare(bootstrapPlan([dependent]))).rejects.toThrow(/requires one reviewed/i);
        const missingDependencyEvidence = await reviewedBaseline(dependent);
        await expect(
            bootstrap.prepare(bootstrapPlan([dependency, dependent], [missingDependencyEvidence])),
        ).rejects.toThrow(/dependencies differ/i);
        const linked = await reviewedBaseline(dependent, {
            dependencies: [
                {
                    kind: dependency.envelope.kind,
                    version: dependency.envelope.version,
                    packageDigest: dependency.digest,
                },
            ],
            selectorRoot: "connectors/other",
        });
        await expect(bootstrap.prepare(bootstrapPlan([dependency, dependent], [linked]))).rejects.toThrow(/selector/i);
        expect(await readdir(fixture.root)).toEqual([]);
    });
});
