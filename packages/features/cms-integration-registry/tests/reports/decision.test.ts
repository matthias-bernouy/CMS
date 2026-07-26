import { afterEach, describe, expect, test } from "bun:test";
import {
    composeReleaseAdmissionDecision,
    identifyReleaseAdmissionDecision,
} from "@bernouy/cms-integration-verification";
import { ReleaseAdmissionDecisionStaleError } from "@bernouy/cms-integration-registry";
import { FsReleaseAdmissionDecisionStore } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures } from "../publication/fixtures";
import {
    completeDecisionEvidence,
    POLICY_DIGEST,
    publishedReleaseFixture,
    releaseStores,
    verificationReport,
} from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem composite release admission decisions", () => {
    test("recomposes against exact current reports and rejects a stale decision", async () => {
        const { fixture, source, target, stores } = await publishedReleaseFixture();
        const evidence = await completeDecisionEvidence(source.digest, target.digest);
        await stores.compatibilityReports.append({ report: evidence.compatibility, expectedCurrent: null });
        const verificationHistory = await stores.verificationReports.append({
            report: evidence.verification,
            expectedCurrent: null,
        });
        await stores.migrationReports.append({ report: evidence.migration, expectedCurrent: null });
        const decisionHistory = await stores.decisions.append({ report: evidence.decision, expectedCurrent: null });

        expect((await releaseStores(fixture).decisions.get("demo", "1.1.0"))?.current.admissible).toBeTrue();

        const revisedVerification = verificationReport(target.digest, {
            reportId: "verification-2",
            revisionType: "revision",
            supersedes: evidence.verification.reportId,
            createdAt: "2026-07-26T12:02:00.000Z",
        });
        await stores.verificationReports.append({
            report: revisedVerification,
            expectedCurrent: {
                revisionId: verificationHistory.currentRevisionId,
                reportDigest: verificationHistory.currentReportDigest,
            },
        });
        await expect(stores.decisions.get("demo", "1.1.0")).rejects.toBeInstanceOf(ReleaseAdmissionDecisionStaleError);

        const revisedDecision = await composeReleaseAdmissionDecision({
            decisionId: "decision-2",
            revisionType: "revision",
            supersedes: evidence.decision.decisionId,
            compatibility: evidence.compatibility,
            verification: revisedVerification,
            migrations: [evidence.migration],
            statefulChanges: evidence.statefulChanges,
            policy: evidence.decision.policy,
            policySnapshotDigest: POLICY_DIGEST,
            createdAt: "2026-07-26T12:03:00.000Z",
            provenance: { actor: "repository-ci", reason: "verification-report-revised" },
        });
        const rootDecision = await identifyReleaseAdmissionDecision(evidence.decision);
        await stores.decisions.append({
            report: revisedDecision,
            expectedCurrent: {
                revisionId: decisionHistory.currentRevisionId,
                reportDigest: rootDecision.digest,
            },
        });

        expect((await stores.decisions.get("demo", "1.1.0"))?.current.decisionId).toBe("decision-2");
    });

    test("rejects report-reference substitution before writing", async () => {
        const { source, target, stores } = await publishedReleaseFixture();
        const evidence = await completeDecisionEvidence(source.digest, target.digest);
        await stores.compatibilityReports.append({ report: evidence.compatibility, expectedCurrent: null });
        await stores.verificationReports.append({ report: evidence.verification, expectedCurrent: null });
        await stores.migrationReports.append({ report: evidence.migration, expectedCurrent: null });

        await expect(
            stores.decisions.append({
                report: {
                    ...evidence.decision,
                    compatibilityReport: {
                        ...evidence.decision.compatibilityReport,
                        reportDigest: "f".repeat(64),
                    },
                },
                expectedCurrent: null,
            }),
        ).rejects.toThrow();
        expect(await stores.decisions.get("demo", "1.1.0")).toBeNull();
    });

    test("serializes report advancement after decision recomposition and commit", async () => {
        const { fixture, source, target, stores } = await publishedReleaseFixture();
        const evidence = await completeDecisionEvidence(source.digest, target.digest);
        await stores.compatibilityReports.append({ report: evidence.compatibility, expectedCurrent: null });
        const verificationHistory = await stores.verificationReports.append({
            report: evidence.verification,
            expectedCurrent: null,
        });
        await stores.migrationReports.append({ report: evidence.migration, expectedCurrent: null });
        const revisedVerification = verificationReport(target.digest, {
            reportId: "verification-racing-2",
            revisionType: "revision",
            supersedes: evidence.verification.reportId,
            createdAt: "2026-07-26T12:02:00.000Z",
        });
        const events: string[] = [];
        let competing: Promise<unknown> | undefined;
        const racingVerificationStore = {
            append: stores.verificationReports.append.bind(stores.verificationReports),
            get: async (kind: string, version: string) => {
                const current = await stores.verificationReports.get(kind, version);
                competing ??= stores.verificationReports
                    .append({
                        report: revisedVerification,
                        expectedCurrent: {
                            revisionId: verificationHistory.currentRevisionId,
                            reportDigest: verificationHistory.currentReportDigest,
                        },
                    })
                    .then(() => events.push("verification-committed"));
                await Promise.resolve();
                return current;
            },
        };
        const decisions = new FsReleaseAdmissionDecisionStore({
            root: fixture.root,
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            compatibilityReports: stores.compatibilityReports,
            verificationReports: racingVerificationStore,
            migrationReports: stores.migrationReports,
        });

        await decisions.append({ report: evidence.decision, expectedCurrent: null });
        events.push("decision-committed");
        await competing;

        expect(events).toEqual(["decision-committed", "verification-committed"]);
        await expect(stores.decisions.get("demo", "1.1.0")).rejects.toBeInstanceOf(ReleaseAdmissionDecisionStaleError);
    });
});
