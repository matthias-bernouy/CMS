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
import {
    adverseRevision,
    compatibleRevision,
    persistedRecord,
    promotionJournals,
    promotionRecords,
    reportStore,
    stablePromoter,
} from "./promotionFixtures";
import { completeDecisionEvidence, releaseStores } from "../reports/fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem stable promotion", () => {
    test("promotes only from the exact current composite release decision", async () => {
        const fixture = registryFixture();
        const source = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const target = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
        const stores = releaseStores(fixture);
        const evidence = await completeDecisionEvidence(source.digest, target.digest);
        await stores.compatibilityReports.append({ report: evidence.compatibility, expectedCurrent: null });
        await stores.verificationReports.append({ report: evidence.verification, expectedCurrent: null });
        await stores.migrationReports.append({ report: evidence.migration, expectedCurrent: null });
        await stores.decisions.append({ report: evidence.decision, expectedCurrent: null });
        const promoter = new FsIntegrationRegistryStablePromoter({
            root: fixture.root,
            snapshots: fixture.snapshots,
            decisions: stores.decisions,
            mutations: fixture.mutations,
            createOperationId: () => "composite-operation-1",
            createPromotionId: () => "composite-promotion-1",
            now: () => "2026-07-26T12:00:00.000Z",
        });

        const result = await promoter.promoteStable({
            kind: "demo",
            version: "1.1.0",
            currentReportRevisionId: evidence.decision.decisionId,
            actor: "admin:user-1",
            confirmation: { version: "1.1.0", reportRevisionId: evidence.decision.decisionId },
        });

        expect(result.record).toMatchObject({
            schema: "cms.integration.registry.stable-promotion.v2",
            reportRevisionId: evidence.decision.decisionId,
            reportDigest: (await identifyReleaseAdmissionDecision(evidence.decision)).digest,
            reportType: "release-admission-decision",
        });
        expect(result.snapshot.getIndex("demo")?.stable).toBe("1.1.0");
    });

    test("does not fall back to an admissible legacy compatibility report when no composite decision exists", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const target = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
        const stores = releaseStores(fixture);
        const promoter = new FsIntegrationRegistryStablePromoter({
            root: fixture.root,
            snapshots: fixture.snapshots,
            decisions: stores.decisions,
            mutations: fixture.mutations,
        });

        expect(target.report.admissible).toBeTrue();
        await expect(
            promoter.promoteStable({
                kind: "demo",
                version: "1.1.0",
                currentReportRevisionId: target.report.id,
                actor: "admin:user-1",
                confirmation: { version: "1.1.0", reportRevisionId: target.report.id },
            }),
        ).rejects.toBeInstanceOf(IntegrationRegistryStablePromotionNotFoundError);
        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBe("1.0.0");
    });

    test("moves stable with an immutable current-report record and never auto-demotes", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
        const reports = reportStore(fixture);
        const promoter = stablePromoter(fixture, reports);

        const result = await promoter.promoteStable({
            kind: "demo",
            version: "1.1.0",
            currentReportRevisionId: published.report.id,
            actor: "admin:user-1",
            confirmation: { version: "1.1.0", reportRevisionId: published.report.id },
            reason: "Validated for the production channel",
        });

        expect(result.snapshot.getIndex("demo")).toMatchObject({ stable: "1.1.0", latest: "1.1.0" });
        expect(result.record).toEqual({
            schema: "cms.integration.registry.stable-promotion.v1",
            id: "promotion-1",
            operationId: "promotion-operation-1",
            kind: "demo",
            version: "1.1.0",
            packageDigest: published.digest,
            reportRevisionId: published.report.id,
            previousStable: "1.0.0",
            actor: "admin:user-1",
            confirmation: { version: "1.1.0", reportRevisionId: published.report.id },
            createdAt: "2026-07-26T12:00:00.000Z",
            reason: "Validated for the production channel",
        });
        expect(await persistedRecord(fixture.root)).toEqual(result.record);
        expect(readdirSync(promotionJournals(fixture.root))).toEqual([]);

        const adverse = adverseRevision(fixture, published.report.id);
        await reports.appendRevision(adverse);

        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBe("1.1.0");
        expect((await persistedRecord(fixture.root))?.reportRevisionId).toBe(published.report.id);
        expect((await reports.get("demo", "1.1.0"))?.current.id).toBe(adverse.id);
    });

    test("returns structured errors for missing confirmation, stale reports, and adverse current reports", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
        const reports = reportStore(fixture);
        const promoter = stablePromoter(fixture, reports);
        const request = {
            kind: "demo",
            version: "1.1.0",
            currentReportRevisionId: published.report.id,
            actor: "admin:user-1",
            confirmation: { version: "1.1.0", reportRevisionId: published.report.id },
        };

        await expect(
            promoter.promoteStable({
                ...request,
                confirmation: { version: "1.0.0", reportRevisionId: published.report.id },
            }),
        ).rejects.toBeInstanceOf(IntegrationRegistryStablePromotionConfirmationError);
        const reassessed = compatibleRevision(fixture, published.report.id);
        await reports.appendRevision(reassessed);
        await expect(promoter.promoteStable(request)).rejects.toBeInstanceOf(
            IntegrationRegistryStablePromotionStaleReportError,
        );
        const adverse = adverseRevision(fixture, reassessed.id);
        await reports.appendRevision(adverse);
        await expect(
            promoter.promoteStable({
                ...request,
                currentReportRevisionId: adverse.id,
                confirmation: { version: "1.1.0", reportRevisionId: adverse.id },
            }),
        ).rejects.toBeInstanceOf(IntegrationRegistryStablePromotionIneligibleError);
        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBe("1.0.0");
    });

    test("rejects promotion of a non-installable version even when its compatibility report is admissible", async () => {
        const fixture = registryFixture();
        const published = await fixture.publishUnverified(await publicationPackage("demo", "1.0.0"));
        const reports = reportStore(fixture);
        const promoter = stablePromoter(fixture, reports);

        expect(published.report.admissible).toBe(true);
        await expect(
            promoter.promoteStable({
                kind: "demo",
                version: "1.0.0",
                currentReportRevisionId: published.report.id,
                actor: "admin:user-1",
                confirmation: { version: "1.0.0", reportRevisionId: published.report.id },
            }),
        ).rejects.toBeInstanceOf(IntegrationRegistryStablePromotionIneligibleError);
        expect(fixture.snapshots.current().getIndex("demo")).toMatchObject({
            versions: [{ version: "1.0.0", status: "unverified" }],
        });
        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBeUndefined();
        expect(existsSync(promotionRecords(fixture.root))).toBe(false);
    });

    test("serializes duplicate promotions so exactly one audit record wins", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
        const reports = reportStore(fixture);
        let sequence = 0;
        const promoter = new FsIntegrationRegistryStablePromoter({
            root: fixture.root,
            snapshots: fixture.snapshots,
            reports,
            mutations: fixture.mutations,
            createOperationId: () => `operation-${++sequence}`,
            createPromotionId: () => `promotion-${sequence}`,
            now: () => "2026-07-26T12:00:00.000Z",
        });
        const request = {
            kind: "demo",
            version: "1.1.0",
            currentReportRevisionId: published.report.id,
            actor: "admin:user-1",
            confirmation: { version: "1.1.0", reportRevisionId: published.report.id },
        };

        const results = await Promise.allSettled([promoter.promoteStable(request), promoter.promoteStable(request)]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toBeInstanceOf(IntegrationRegistryStablePromotionConflictError);
        expect(readdirSync(promotionRecords(fixture.root))).toHaveLength(1);
        expect(fixture.snapshots.current().getIndex("demo")?.stable).toBe("1.1.0");
    });
});
