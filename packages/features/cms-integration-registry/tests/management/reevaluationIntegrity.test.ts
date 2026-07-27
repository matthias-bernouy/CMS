import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    IntegrationCompatibilityReevaluationIntegrityError,
    IntegrationCompatibilityReevaluationStaleReportError,
} from "@bernouy/cms-integration-registry";
import { cleanupRegistryFixtures, publishReviewedSqlVersionPair, registryFixture } from "../publication/fixtures";
import {
    publishVersionPair,
    reevaluationRequest,
    reevaluationServices,
    rewriteCompatibilityRoot,
    seedCompatibilityRoot,
} from "./reevaluationFixtures";

afterEach(cleanupRegistryFixtures);

describe("compatibility reevaluation integrity", () => {
    test("rejects an admission baseline whose immutable digest no longer matches", async () => {
        const fixture = registryFixture();
        await publishVersionPair(fixture);
        await rewriteCompatibilityRoot(fixture.root, "1.1.0", (report) => {
            report.baselines = [{ kind: "demo", version: "1.0.0", packageDigest: "f".repeat(64) }];
        });
        const { reevaluator, reports } = reevaluationServices(fixture);
        const current = (await reports.get("demo", "1.1.0"))!;

        const promise = reevaluator.reevaluate(reevaluationRequest(current));

        await expect(promise).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationIntegrityError);
        await expect(promise).rejects.toMatchObject({ status: 409 });
    });

    test("rejects a structurally corrupt immutable baseline selection", async () => {
        const fixture = registryFixture();
        await publishVersionPair(fixture);
        await rewriteCompatibilityRoot(
            fixture.root,
            "1.1.0",
            (report) => {
                report.baselines = [];
            },
            false,
        );
        const { reevaluator } = reevaluationServices(fixture);

        await expect(
            reevaluator.reevaluate(
                reevaluationRequest({
                    revisionId: "report-1",
                    reportDigest: "f".repeat(64),
                }),
            ),
        ).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationIntegrityError);
    });

    test("rejects baseline package contents corrupted after snapshot capture", async () => {
        const fixture = registryFixture();
        const { compatibility } = await publishVersionPair(fixture);
        const baseline = fixture.snapshots.current().locateExactVersion("demo", "1.0.0")!;
        const implementation = join(baseline.packageRoot, "implementation.txt");
        chmodSync(implementation, 0o640);
        writeFileSync(implementation, "tampered implementation\n");
        const { reevaluator } = reevaluationServices(fixture);

        await expect(reevaluator.reevaluate(reevaluationRequest(compatibility))).rejects.toBeInstanceOf(
            IntegrationCompatibilityReevaluationIntegrityError,
        );
    });

    test("serializes concurrent appends through the shared report store", async () => {
        const fixture = registryFixture();
        const { compatibility } = await publishVersionPair(fixture);
        const { reevaluator, reports } = reevaluationServices(fixture);
        const request = reevaluationRequest(compatibility);

        const outcomes = await Promise.allSettled([reevaluator.reevaluate(request), reevaluator.reevaluate(request)]);

        expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
        const rejected = outcomes.find(({ status }) => status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toBeInstanceOf(IntegrationCompatibilityReevaluationStaleReportError);
        expect(rejected.reason).toMatchObject({ status: 409 });
        expect((await reports.get("demo", "1.1.0"))?.revisions).toHaveLength(2);
    });

    test("rejects a corrupt reviewed baseline instead of silently dropping it", async () => {
        const fixture = registryFixture();
        const { baselinePackage, candidate } = await publishReviewedSqlVersionPair(fixture);
        const compatibility = await seedCompatibilityRoot(fixture, candidate.version, baselinePackage.envelope.version);
        const baselineRoot = join(fixture.root, ".registry", "schema-baselines");
        const history = readdirSync(baselineRoot)[0]!;
        const revisionPath = join(baselineRoot, history, "revisions", "0000000001.json");
        const document = JSON.parse(readFileSync(revisionPath, "utf8")) as {
            baseline: { packageDigest: string };
        };
        document.baseline.packageDigest = "f".repeat(64);
        chmodSync(revisionPath, 0o640);
        writeFileSync(revisionPath, canonicalJsonBytes(document));
        const { reevaluator } = reevaluationServices(fixture);

        const reevaluation = reevaluator.reevaluate({
            ...reevaluationRequest(compatibility),
            version: candidate.version,
        });

        await expect(reevaluation).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationIntegrityError);
    });
});
