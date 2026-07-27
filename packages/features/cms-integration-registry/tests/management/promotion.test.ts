import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { identifyReleaseAdmissionDecision } from "@bernouy/cms-integration-verification";
import {
    IntegrationRegistryStablePromotionConfirmationError,
    IntegrationRegistryStablePromotionConflictError,
    IntegrationRegistryStablePromotionIneligibleError,
    IntegrationRegistryStablePromotionNotFoundError,
    IntegrationRegistryStablePromotionStaleReportError,
} from "@bernouy/cms-integration-registry";
import { FsIntegrationRegistryStablePromoter } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../publication/fixtures";
import { releaseStores } from "../reports/fixtures";
import { appendAdverseDecisionRevision, appendDecision } from "./eligibility/decisionFixtures";
import { persistedRecord, promotionJournals, promotionRecords, stablePromoter } from "./promotionFixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem stable promotion", () => {
    test("promotes only from the exact current composite release decision", async () => {
        const fixture = await publishedVersions();
        const current = await appendDecision(fixture, "1.1.0");
        const result = await stablePromoter(fixture, current.stores.decisions).promoteStable(
            promotionRequest(current.decision.decisionId),
        );

        expect(result.record).toMatchObject({
            schema: "cms.integration.registry.stable-promotion.v2",
            reportRevisionId: current.decision.decisionId,
            reportDigest: (await identifyReleaseAdmissionDecision(current.decision)).digest,
            reportType: "release-admission-decision",
        });
        expect(result.snapshot.getIndex("demo")?.stable).toBe("1.1.0");
    });

    test("does not fall back to a compatibility report when no composite decision exists", async () => {
        const fixture = await publishedVersions();
        const promoter = new FsIntegrationRegistryStablePromoter({
            root: fixture.root,
            snapshots: fixture.snapshots,
            decisions: releaseStores(fixture).decisions,
            mutations: fixture.mutations,
        });

        await expect(promoter.promoteStable(promotionRequest("report-2"))).rejects.toBeInstanceOf(
            IntegrationRegistryStablePromotionNotFoundError,
        );
        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBe("1.0.0");
    });

    test("keeps the immutable decision reference after later evidence changes", async () => {
        const fixture = await publishedVersions();
        const current = await appendDecision(fixture, "1.1.0");
        const result = await stablePromoter(fixture, current.stores.decisions).promoteStable({
            ...promotionRequest(current.decision.decisionId),
            reason: "Validated for the production channel",
        });

        expect(result.snapshot.getIndex("demo")).toMatchObject({ stable: "1.1.0", latest: "1.1.0" });
        expect(await persistedRecord(fixture.root)).toEqual(result.record);
        expect(readdirSync(promotionJournals(fixture.root))).toEqual([]);

        const adverse = await appendAdverseDecisionRevision(current.stores, current);

        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBe("1.1.0");
        expect((await persistedRecord(fixture.root))?.reportRevisionId).toBe(current.decision.decisionId);
        expect((await current.stores.decisions.get("demo", "1.1.0"))?.current.decisionId).toBe(
            adverse.decision.decisionId,
        );
    });

    test("returns structured errors for missing confirmation, stale decisions, and adverse decisions", async () => {
        const fixture = await publishedVersions();
        const current = await appendDecision(fixture, "1.1.0");
        const promoter = stablePromoter(fixture, current.stores.decisions);
        const request = promotionRequest(current.decision.decisionId);

        await expect(
            promoter.promoteStable({ ...request, confirmation: { ...request.confirmation, version: "1.0.0" } }),
        ).rejects.toBeInstanceOf(IntegrationRegistryStablePromotionConfirmationError);
        const adverse = await appendAdverseDecisionRevision(current.stores, current);
        await expect(promoter.promoteStable(request)).rejects.toBeInstanceOf(
            IntegrationRegistryStablePromotionStaleReportError,
        );
        await expect(promoter.promoteStable(promotionRequest(adverse.decision.decisionId))).rejects.toBeInstanceOf(
            IntegrationRegistryStablePromotionIneligibleError,
        );
        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBe("1.0.0");
    });

    test("rejects promotion of a non-installable version even with an admissible decision", async () => {
        const fixture = registryFixture();
        await fixture.publishUnverified(await publicationPackage("demo", "1.0.0"));
        const current = await appendDecision(fixture, "1.0.0");

        await expect(
            stablePromoter(fixture, current.stores.decisions).promoteStable(
                promotionRequest(current.decision.decisionId, "1.0.0"),
            ),
        ).rejects.toBeInstanceOf(IntegrationRegistryStablePromotionIneligibleError);
        expect(fixture.snapshots.current().getIndex("demo")).toMatchObject({
            versions: [{ version: "1.0.0", status: "unverified" }],
        });
        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBeUndefined();
        expect(existsSync(promotionRecords(fixture.root))).toBe(false);
    });

    test("serializes duplicate promotions so exactly one audit record wins", async () => {
        const fixture = await publishedVersions();
        const current = await appendDecision(fixture, "1.1.0");
        let sequence = 0;
        const promoter = new FsIntegrationRegistryStablePromoter({
            root: fixture.root,
            snapshots: fixture.snapshots,
            decisions: current.stores.decisions,
            mutations: fixture.mutations,
            createOperationId: () => `operation-${++sequence}`,
            createPromotionId: () => `promotion-${sequence}`,
            now: () => "2026-07-26T12:00:00.000Z",
        });
        const request = promotionRequest(current.decision.decisionId);

        const results = await Promise.allSettled([promoter.promoteStable(request), promoter.promoteStable(request)]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toBeInstanceOf(IntegrationRegistryStablePromotionConflictError);
        expect(readdirSync(promotionRecords(fixture.root))).toHaveLength(1);
        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBe("1.1.0");
    });
});

async function publishedVersions() {
    const fixture = registryFixture();
    await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
    await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
    return fixture;
}

function promotionRequest(reportRevisionId: string, version = "1.1.0") {
    return {
        kind: "demo",
        version,
        currentReportRevisionId: reportRevisionId,
        actor: "admin:user-1",
        confirmation: { version, reportRevisionId },
    };
}
