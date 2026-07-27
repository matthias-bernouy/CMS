import { afterEach, describe, expect, test } from "bun:test";
import {
    IntegrationCompatibilityEvaluator,
    IntegrationCompatibilityReevaluationPendingActivationError,
} from "@bernouy/cms-integration-registry";
import {
    FsIntegrationCompatibilityReevaluator,
    FsIntegrationRegistryCandidateFinalizer,
} from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, registryFixture } from "../../../publication/fixtures";
import { finalizerConfig, passedCandidate, releaseStores } from "../fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem candidate release recovery", () => {
    test("defers compatibility reevaluation until the unverified candidate is activated", async () => {
        const fixture = registryFixture();
        const setup = await passedCandidate(fixture, "candidate-reevaluation-race");
        const stores = releaseStores(fixture);
        const reevaluator = new FsIntegrationCompatibilityReevaluator({
            snapshots: fixture.snapshots,
            reports: stores.compatibilityReports,
            evaluator: new IntegrationCompatibilityEvaluator({
                identity: { name: "registry-race-test", version: "1.0.0" },
                now: () => "2026-07-26T10:00:06.000Z",
                createReportId: () => "candidate-race-reevaluation",
            }),
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
        });
        let interleavedFailure: unknown;
        const finalizer = new FsIntegrationRegistryCandidateFinalizer({
            ...finalizerConfig(fixture, setup.store, setup.policy, stores),
            compatibilityReports: {
                get: (...input) => stores.compatibilityReports.get(...input),
                list: (...input) => stores.compatibilityReports.list(...input),
                append: async (input) => {
                    const history = await stores.compatibilityReports.append(input);
                    expect(fixture.snapshots.current().getIndex("demo")?.versions[0]?.status).toBe("unverified");
                    try {
                        await reevaluator.reevaluate({
                            kind: "demo",
                            version: "1.0.0",
                            currentReport: {
                                revisionId: history.currentRevisionId,
                                reportDigest: history.currentReportDigest,
                            },
                            actor: "admin:race-test",
                            reason: "Interleave reevaluation before candidate activation",
                        });
                    } catch (error) {
                        interleavedFailure = error;
                    }
                    return history;
                },
            },
        });

        await expect(finalizer.finalize("candidate-reevaluation-race")).resolves.toMatchObject({
            status: "published",
        });
        expect(interleavedFailure).toBeInstanceOf(IntegrationCompatibilityReevaluationPendingActivationError);
        expect(fixture.snapshots.current().getIndex("demo")?.versions[0]?.status).toBeUndefined();

        const current = await stores.compatibilityReports.get("demo", "1.0.0");
        expect(current).not.toBeNull();
        const reevaluated = await reevaluator.reevaluate({
            kind: "demo",
            version: "1.0.0",
            currentReport: {
                revisionId: current!.currentRevisionId,
                reportDigest: current!.currentReportDigest,
            },
            actor: "admin:race-test",
            reason: "Reevaluate after candidate activation",
        });
        expect(reevaluated).toMatchObject({
            revision: { supersedes: current!.currentRevisionId },
        });
    });
});
