import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    IntegrationCompatibilityEvaluator,
    IntegrationCompatibilityReevaluationIntegrityError,
    IntegrationCompatibilityReevaluationStaleReportError,
} from "@bernouy/cms-integration-registry";
import { cleanupRegistryFixtures, publishReviewedSqlVersionPair, registryFixture } from "../publication/fixtures";
import {
    compositeReevaluationServices,
    publishVersionPair,
    reevaluationRequest,
    reevaluationServices,
    rewriteAdmission,
} from "./reevaluationFixtures";
import { appendDecision } from "./eligibility/decisionFixtures";

afterEach(cleanupRegistryFixtures);

describe("compatibility reevaluation integrity", () => {
    test("rejects an admission baseline whose immutable digest no longer matches", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        rewriteAdmission(fixture.root, "1.1.0", (report) => {
            report.baselines = [{ kind: "demo", version: "1.0.0", packageDigest: "f".repeat(64) }];
        });
        const { reevaluator } = reevaluationServices(fixture);

        const promise = reevaluator.reevaluate(reevaluationRequest(candidate.report.id));

        await expect(promise).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationIntegrityError);
        await expect(promise).rejects.toMatchObject({ status: 409 });
    });

    test("rejects a structurally corrupt immutable baseline selection", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        rewriteAdmission(fixture.root, "1.1.0", (report) => {
            report.baselines = [];
        });
        const { reevaluator } = reevaluationServices(fixture);

        await expect(reevaluator.reevaluate(reevaluationRequest(candidate.report.id))).rejects.toBeInstanceOf(
            IntegrationCompatibilityReevaluationIntegrityError,
        );
    });

    test("rejects baseline package contents corrupted after snapshot capture", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        const baseline = fixture.snapshots.current().locateExactVersion("demo", "1.0.0")!;
        const implementation = join(baseline.packageRoot, "implementation.txt");
        chmodSync(implementation, 0o640);
        writeFileSync(implementation, "tampered implementation\n");
        const { reevaluator } = reevaluationServices(fixture);

        await expect(reevaluator.reevaluate(reevaluationRequest(candidate.report.id))).rejects.toBeInstanceOf(
            IntegrationCompatibilityReevaluationIntegrityError,
        );
    });

    test("serializes concurrent appends through the shared report store", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        const { reevaluator, reports } = reevaluationServices(fixture);
        const request = reevaluationRequest(candidate.report.id);

        const outcomes = await Promise.allSettled([reevaluator.reevaluate(request), reevaluator.reevaluate(request)]);

        expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
        const rejected = outcomes.find(({ status }) => status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toBeInstanceOf(IntegrationCompatibilityReevaluationStaleReportError);
        expect(rejected.reason).toMatchObject({ status: 409 });
        expect((await reports.get("demo", "1.1.0"))?.reports).toHaveLength(2);
    });

    test("rejects a corrupt reviewed baseline instead of silently dropping it", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishReviewedSqlVersionPair(fixture);
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
            ...reevaluationRequest(candidate.report.id),
            version: candidate.version,
        });

        await expect(reevaluation).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationIntegrityError);
    });

    test("recovers a crash after the legacy revision append and remains idempotent after restart", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        const admission = await appendDecision(fixture, candidate.version);
        const legacy = reevaluationServices(fixture, laterEvaluator("legacy-after-crash"));
        const revision = await legacy.reevaluator.reevaluate(reevaluationRequest(candidate.report.id));

        const restarted = compositeReevaluationServices(fixture, admission.stores, admission.policy);
        const recovered = await restarted.reconciler.reconcile("demo", candidate.version, {
            actor: "repository:recovery",
            reason: "Recover interrupted compatibility projection",
        });

        expect(recovered?.decisionChanged).toBeTrue();
        expect((await admission.stores.compatibilityReports.get("demo", candidate.version))?.current).toMatchObject({
            reportId: `compat-${revision.revision.id}`,
            supersedes: admission.decision.compatibilityReport.revisionId,
        });
        expect(recovered?.decision.current.compatibilityReport.revisionId).toBe(`compat-${revision.revision.id}`);
        const repeated = await restarted.reconciler.reconcile("demo", candidate.version, {
            actor: "repository:recovery",
            reason: "Repeat interrupted compatibility recovery",
        });
        expect(repeated).toMatchObject({ decisionChanged: false, eligibilityChanged: false });
        expect(repeated?.decision.revisions).toHaveLength(2);
    });

    test("does not replace a projected compatibility revision newer than the legacy stream", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        const admission = await appendDecision(fixture, candidate.version);
        const legacy = reevaluationServices(fixture, laterEvaluator("legacy-before-newer-v2"));
        const revision = await legacy.reevaluator.reevaluate(reevaluationRequest(candidate.report.id));
        const current = (await admission.stores.compatibilityReports.get("demo", candidate.version))!;
        const newer = {
            ...current.current,
            reportId: "compatibility-newer-than-legacy",
            revisionType: "revision" as const,
            supersedes: current.currentRevisionId,
            createdAt: "2026-07-26T14:00:00.000Z",
            provenance: { actor: "repository-ci", reason: "Newer projected compatibility evidence" },
        };
        await admission.stores.compatibilityReports.append({
            report: newer,
            expectedCurrent: {
                revisionId: current.currentRevisionId,
                reportDigest: current.currentReportDigest,
            },
        });

        const restarted = compositeReevaluationServices(fixture, admission.stores, admission.policy);
        const recovered = await restarted.reconciler.reconcile("demo", candidate.version, {
            actor: "repository:recovery",
            reason: "Preserve the newer projected compatibility stream",
        });
        const compatibility = (await admission.stores.compatibilityReports.get("demo", candidate.version))!;

        expect(compatibility.currentRevisionId).toBe(newer.reportId);
        expect(compatibility.revisions.map(({ reportId }) => reportId)).not.toContain(`compat-${revision.revision.id}`);
        expect(recovered?.decision.current.compatibilityReport.revisionId).toBe(newer.reportId);
    });
});

function laterEvaluator(reportId: string): IntegrationCompatibilityEvaluator {
    return new IntegrationCompatibilityEvaluator({
        identity: { name: "registry-recovery-test", version: "1.0.0" },
        now: () => "2026-07-26T13:00:00.000Z",
        createReportId: () => reportId,
    });
}
