import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { identifyVerificationReport } from "@bernouy/cms-integration-verification";
import { ReleaseReportConflictError } from "@bernouy/cms-integration-registry";
import { FsIntegrationCompatibilityReportStore } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage } from "../publication/fixtures";
import { completeDecisionEvidence, publishedReleaseFixture, releaseStores, verificationReport } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem release report histories", () => {
    test("persists a legacy verification root and exact append-only revisions across restart", async () => {
        const { fixture, target, stores } = await publishedReleaseFixture();
        const root = verificationReport(target.digest);
        const first = await stores.verificationReports.append({ report: root, expectedCurrent: null });
        const rootIdentity = await identifyVerificationReport(root);
        const revision = verificationReport(target.digest, {
            reportId: "verification-2",
            revisionType: "revision",
            supersedes: root.reportId,
            createdAt: "2026-07-26T12:01:00.000Z",
        });
        const appended = await stores.verificationReports.append({
            report: revision,
            expectedCurrent: { revisionId: root.reportId, reportDigest: rootIdentity.digest },
        });
        const restarted = releaseStores(fixture);

        expect(first.current).toMatchObject({ revisionType: "root", origin: "legacy-backfill" });
        expect(appended.revisions.map((report) => report.reportId)).toEqual(["verification-1", "verification-2"]);
        expect((await restarted.verificationReports.get("demo", "1.1.0"))?.current.reportId).toBe("verification-2");
    });

    test("enforces exact CAS and admits one concurrent branch", async () => {
        const { target, stores } = await publishedReleaseFixture();
        const root = verificationReport(target.digest);
        const history = await stores.verificationReports.append({ report: root, expectedCurrent: null });
        const expectedCurrent = {
            revisionId: history.currentRevisionId,
            reportDigest: history.currentReportDigest,
        };
        const branch = (reportId: string) =>
            verificationReport(target.digest, {
                reportId,
                revisionType: "revision",
                supersedes: root.reportId,
                createdAt: "2026-07-26T12:01:00.000Z",
            });
        const results = await Promise.allSettled([
            stores.verificationReports.append({ report: branch("verification-2a"), expectedCurrent }),
            stores.verificationReports.append({ report: branch("verification-2b"), expectedCurrent }),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toBeInstanceOf(ReleaseReportConflictError);
        expect((await stores.verificationReports.get("demo", "1.1.0"))?.revisions).toHaveLength(2);
    });

    test("keeps compatibility v1 readable while v2 is stored independently", async () => {
        const { fixture, source, target, stores } = await publishedReleaseFixture();
        const evidence = await completeDecisionEvidence(source.digest, target.digest);
        const legacy = new FsIntegrationCompatibilityReportStore({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
        });
        const legacyBefore = await legacy.get("demo", "1.1.0");
        await stores.compatibilityReports.append({ report: evidence.compatibility, expectedCurrent: null });

        expect(legacyBefore?.current).toHaveProperty("admissible");
        expect((await legacy.get("demo", "1.1.0"))?.current).toEqual(legacyBefore?.current);
        expect((await stores.compatibilityReports.get("demo", "1.1.0"))?.current).toHaveProperty("contractAdmissible");
    });

    test("fails before writing histories or revisions beyond configured hard caps", async () => {
        const { fixture, source, target } = await publishedReleaseFixture();
        const stores = releaseStores(fixture, { historiesPerStream: 1, revisionsPerHistory: 1 });
        const root = verificationReport(target.digest);
        const history = await stores.verificationReports.append({ report: root, expectedCurrent: null });
        const revision = verificationReport(target.digest, {
            reportId: "verification-2",
            revisionType: "revision",
            supersedes: root.reportId,
            createdAt: "2026-07-26T12:01:00.000Z",
        });

        await expect(
            stores.verificationReports.append({
                report: revision,
                expectedCurrent: {
                    revisionId: history.currentRevisionId,
                    reportDigest: history.currentReportDigest,
                },
            }),
        ).rejects.toThrow(/already contains 1 revisions/);
        await expect(
            stores.verificationReports.append({
                report: verificationReport(source.digest, {
                    reportId: "verification-source-1",
                    version: "1.0.0",
                }),
                expectedCurrent: null,
            }),
        ).rejects.toThrow(/already contains 1 histories/);

        const streamRoot = join(fixture.root, ".registry", "release-reports", "verification");
        const histories = readdirSync(streamRoot);
        expect(histories).toHaveLength(1);
        expect(readdirSync(join(streamRoot, histories[0]!, "revisions"))).toEqual(["0000000001.json"]);
    });

    test("does not create a new history for an invalid initial CAS or revision shape", async () => {
        const { fixture, source, target, stores } = await publishedReleaseFixture();
        await expect(
            stores.verificationReports.append({
                report: verificationReport(target.digest),
                expectedCurrent: { revisionId: "missing", reportDigest: "f".repeat(64) },
            }),
        ).rejects.toBeInstanceOf(ReleaseReportConflictError);
        await expect(
            stores.verificationReports.append({
                report: verificationReport(source.digest, {
                    reportId: "verification-invalid-root",
                    version: "1.0.0",
                    revisionType: "revision",
                    supersedes: "missing",
                }),
                expectedCurrent: null,
            }),
        ).rejects.toThrow(/must be a root/);

        expect(existsSync(join(fixture.root, ".registry", "release-reports"))).toBeFalse();
    });

    test("serializes the stream-wide history capacity across different integration kinds", async () => {
        const { fixture, target } = await publishedReleaseFixture();
        const other = await publicationPackage("other", "1.0.0");
        await fixture.publisher.publish({ package: other });
        const stores = releaseStores(fixture, { historiesPerStream: 1 });

        const results = await Promise.allSettled([
            stores.verificationReports.append({ report: verificationReport(target.digest), expectedCurrent: null }),
            stores.verificationReports.append({
                report: verificationReport(other.digest, { reportId: "other-1", kind: "other", version: "1.0.0" }),
                expectedCurrent: null,
            }),
        ]);

        expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
        expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
        const streamRoot = join(fixture.root, ".registry", "release-reports", "verification");
        expect(readdirSync(streamRoot)).toHaveLength(1);
    });
});
