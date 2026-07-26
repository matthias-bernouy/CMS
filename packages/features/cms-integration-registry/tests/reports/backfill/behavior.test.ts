import { afterEach, describe, expect, test } from "bun:test";
import { identifyIntegrationVerificationBackfillRequest } from "@bernouy/cms-integration-registry";
import { FsIntegrationVerificationBackfiller } from "@bernouy/cms-integration-registry/fs";
import {
    identifyCompatibilityReportV2,
    identifyReleaseAdmissionDecision,
    identifyVerificationReport,
} from "@bernouy/cms-integration-verification";
import { cleanupRegistryFixtures } from "../../publication/fixtures";
import { alternateBackfillRequest, orphanBackfillRequest, populatedBackfillFixture } from "./support";

afterEach(cleanupRegistryFixtures);

describe("populated registry verification backfill", () => {
    test("atomically attaches exact legacy evidence and is exactly idempotent", async () => {
        const context = await populatedBackfillFixture();
        const previousIndex = context.fixture.snapshots.current().getIndex("demo")!;
        const first = await context.backfiller.backfill(context.request);
        const replay = await context.backfiller.backfill(context.request);

        expect(first).toMatchObject({
            outcome: "backfilled",
            kind: "demo",
            version: "1.0.0",
            packageDigest: context.integrationPackage.digest,
            verificationDigest: context.entry.verification.digest,
        });
        expect(replay).toMatchObject({
            outcome: "unchanged",
            packageDigest: context.integrationPackage.digest,
            verificationDigest: context.entry.verification.digest,
        });
        const currentIndex = context.fixture.snapshots.current().getIndex("demo")!;
        expect(currentIndex.stable).toBe(previousIndex.stable);
        expect(currentIndex.latest).toBe(previousIndex.latest);
        expect(currentIndex.versions[0]?.status).toBe(previousIndex.versions[0]?.status);
        expect(currentIndex.versions[0]?.verificationDigest).toBe(context.entry.verification.digest);
        expect((await context.bundles.get(context.entry.verification.digest))?.envelope).toEqual(
            context.entry.verification.envelope,
        );
        await expectExactReports(context);
    });

    test("admits an exact unverified version and repairs installable channels", async () => {
        const context = await populatedBackfillFixture({}, { unverifiedPublication: true });
        expect(context.fixture.snapshots.current().getIndex("demo")).toMatchObject({
            versions: [{ version: "1.0.0", status: "unverified" }],
        });

        await context.backfiller.backfill(context.request);

        expect(context.fixture.snapshots.current().getIndex("demo")).toMatchObject({
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [
                {
                    version: "1.0.0",
                    verificationDigest: context.entry.verification.digest,
                },
            ],
        });
        expect(context.fixture.snapshots.current().getIndex("demo")?.versions[0]?.status).toBeUndefined();
    });

    test("rejects an unapproved exact request before every backfill write", async () => {
        let boundaries = 0;
        const context = await populatedBackfillFixture({
            approvedRequestDigests: [],
            afterBoundary() {
                boundaries += 1;
            },
        });

        await expect(context.backfiller.backfill(context.request)).rejects.toMatchObject({
            status: 422,
            code: "verification_backfill_unapproved",
        });
        expect(boundaries).toBe(0);
        expect(await context.bundles.get(context.entry.verification.digest)).toBeNull();
        expect(await context.stores.compatibilityReports.get("demo", "1.0.0")).toBeNull();
        expect(await context.stores.verificationReports.get("demo", "1.0.0")).toBeNull();
        expect(await context.stores.decisions.get("demo", "1.0.0")).toBeNull();
        expect(context.fixture.snapshots.current().getIndex("demo")?.versions[0]?.verificationDigest).toBeUndefined();
    });

    test("rejects orphan, partial, conflicting, and forged evidence fail-closed", async () => {
        const orphan = await populatedBackfillFixture();
        const orphanRequest = await orphanBackfillRequest();
        const orphanDigest = (await identifyIntegrationVerificationBackfillRequest(orphanRequest)).digest;
        await expect(
            new FsIntegrationVerificationBackfiller({
                ...orphan.config,
                approvedRequestDigests: [orphan.requestDigest, orphanDigest],
            }).backfill(orphanRequest),
        ).rejects.toMatchObject({
            code: "verification_backfill_not_found",
        });

        const partial = await populatedBackfillFixture();
        await partial.stores.compatibilityReports.append({
            report: partial.entry.compatibilityReport,
            expectedCurrent: null,
        });
        await expect(partial.backfiller.backfill(partial.request)).rejects.toMatchObject({
            code: "verification_backfill_partial",
        });

        const conflicting = await populatedBackfillFixture();
        await conflicting.backfiller.backfill(conflicting.request);
        const alternate = await alternateBackfillRequest(conflicting.entry);
        const alternateDigest = (await identifyIntegrationVerificationBackfillRequest(alternate)).digest;
        await expect(
            new FsIntegrationVerificationBackfiller({
                ...conflicting.config,
                approvedRequestDigests: [conflicting.requestDigest, alternateDigest],
            }).backfill(alternate),
        ).rejects.toMatchObject({ code: "verification_backfill_conflict" });

        const forged = await populatedBackfillFixture();
        await expect(
            forged.backfiller.backfill({
                ...forged.request,
                verification: { ...forged.request.verification, digest: "f".repeat(64) },
            }),
        ).rejects.toMatchObject({ code: "verification_backfill_invalid" });
        await expect(
            forged.backfiller.backfill({
                ...forged.request,
                decision: { ...forged.request.decision, admissible: false, reasons: ["verification-failed"] },
            }),
        ).rejects.toMatchObject({ code: "verification_backfill_invalid" });
    });
});

async function expectExactReports(context: Awaited<ReturnType<typeof populatedBackfillFixture>>) {
    const compatibility = await identifyCompatibilityReportV2(context.entry.compatibilityReport);
    const verification = await identifyVerificationReport(context.entry.verificationReport);
    const decision = await identifyReleaseAdmissionDecision(context.entry.decision);
    expect(await context.stores.compatibilityReports.get("demo", "1.0.0")).toMatchObject({
        currentRevisionId: context.entry.compatibilityReport.reportId,
        currentReportDigest: compatibility.digest,
    });
    expect(await context.stores.verificationReports.get("demo", "1.0.0")).toMatchObject({
        currentRevisionId: context.entry.verificationReport.reportId,
        currentReportDigest: verification.digest,
    });
    expect(await context.stores.decisions.get("demo", "1.0.0")).toMatchObject({
        currentRevisionId: context.entry.decision.decisionId,
        currentReportDigest: decision.digest,
    });
}
