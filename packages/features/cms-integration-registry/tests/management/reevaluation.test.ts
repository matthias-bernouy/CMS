import { afterEach, describe, expect, test } from "bun:test";
import {
    IntegrationCompatibilityReevaluationNotFoundError,
    IntegrationCompatibilityReevaluationStaleDecisionError,
    IntegrationCompatibilityReevaluationStaleReportError,
    IntegrationCompatibilityReevaluationValidationError,
} from "@bernouy/cms-integration-registry";
import {
    cleanupRegistryFixtures,
    publicationPackage,
    publishReviewedSqlVersionPair,
    registryFixture,
} from "../publication/fixtures";
import { appendDecision } from "./eligibility/decisionFixtures";
import { migrationReport } from "../reports/fixtures/reports";
import {
    compositeReevaluationServices,
    publishMigrationAwareVersionPair,
    publishVersionPair,
    reevaluationRequest,
    reevaluationServices,
} from "./reevaluationFixtures";

afterEach(cleanupRegistryFixtures);

describe("compatibility reevaluation", () => {
    test("rebuilds the exact admission comparison and appends provenance", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        const { reevaluator, reports } = reevaluationServices(fixture);

        const result = await reevaluator.reevaluate({
            ...reevaluationRequest(candidate.report.id),
            version: candidate.version,
        });

        expect(result.revision).toMatchObject({
            reportType: "revision",
            supersedes: candidate.report.id,
            kind: "demo",
            version: "1.1.0",
            packageDigest: candidate.digest,
            baselines: candidate.report.baselines,
            informationalBaselines: [],
            provenance: {
                actor: "admin:user-1",
                reason: "Run the current compatibility evaluator",
                evidenceIds: ["schema-ci-1", "schema-ci-2"],
            },
        });
        expect(result.history.current.id).toBe(result.revision.id);
        expect((await reports.get("demo", "1.1.0"))?.reports.map(({ id }) => id)).toEqual([
            candidate.report.id,
            result.revision.id,
        ]);
    });

    test("preserves the explicit no-baseline semantics for a first version", async () => {
        const fixture = registryFixture();
        const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const { reevaluator } = reevaluationServices(fixture);

        const result = await reevaluator.reevaluate({
            ...reevaluationRequest(published.report.id),
            version: "1.0.0",
            evidenceIds: undefined,
        });

        expect(result.revision).toMatchObject({
            supersedes: published.report.id,
            baselines: [],
            informationalBaselines: [],
            noBaselineReason: "new-kind",
            outcome: "not-applicable",
            releaseLevel: "initial",
        });
        expect(result.revision.provenance.evidenceIds).toBeUndefined();
    });

    test("rejects absent histories and a request that no longer names the current report", async () => {
        const fixture = registryFixture();
        const { reevaluator } = reevaluationServices(fixture);

        await expect(reevaluator.reevaluate(reevaluationRequest("missing-report"))).rejects.toBeInstanceOf(
            IntegrationCompatibilityReevaluationNotFoundError,
        );

        const { candidate } = await publishVersionPair(fixture);
        const first = await reevaluator.reevaluate(reevaluationRequest(candidate.report.id));
        const stale = reevaluator.reevaluate(reevaluationRequest(candidate.report.id));

        await expect(stale).rejects.toMatchObject({
            status: 409,
            requestedReportRevisionId: candidate.report.id,
            currentReportRevisionId: first.revision.id,
        });
        await expect(stale).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationStaleReportError);
    });

    test("validates a closed request shape before reading registry state", async () => {
        const fixture = registryFixture();
        const { reevaluator } = reevaluationServices(fixture);
        const invalid = { ...reevaluationRequest("report-1"), unexpected: true };

        const promise = reevaluator.reevaluate(invalid);

        await expect(promise).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationValidationError);
        await expect(promise).rejects.toMatchObject({ status: 422 });
    });

    test("reuses the exact reviewed legacy schema baseline during reevaluation", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishReviewedSqlVersionPair(fixture);
        const { reevaluator } = reevaluationServices(fixture);

        const result = await reevaluator.reevaluate({
            ...reevaluationRequest(candidate.report.id),
            version: candidate.version,
        });

        expect(result.revision).toMatchObject({
            outcome: candidate.report.outcome,
            requiredReleaseLevel: candidate.report.requiredReleaseLevel,
            evidence: candidate.report.evidence,
        });
        expect(result.revision.evidence).not.toContainEqual(
            expect.objectContaining({ code: "legacy-schema-baseline-missing" }),
        );
    });

    test("appends a composite decision revision from the same compatibility revision", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        const admission = await appendDecision(fixture, candidate.version);
        const { reevaluator } = compositeReevaluationServices(fixture, admission.stores, admission.policy);

        const result = await reevaluator.reevaluate({
            ...reevaluationRequest(candidate.report.id),
            version: candidate.version,
            currentDecision: admission.reference,
        });

        expect(result.release).toMatchObject({
            compatibilityReportRevisionId: `compat-${result.revision.id}`,
            admissible: true,
            eligibilityChanged: false,
        });
        const decisions = await admission.stores.decisions.get("demo", candidate.version);
        expect(decisions?.revisions).toHaveLength(2);
        expect(decisions?.current.compatibilityReport.revisionId).toBe(`compat-${result.revision.id}`);
        expect(decisions?.current.decisionId).toBe(result.release?.decision.revisionId);
    });

    test("reselects stateful migration evidence when schema findings change", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishReviewedSqlVersionPair(fixture, additiveSchemaContract(), "1.1.0");
        const admission = await appendDecision(fixture, candidate.version);
        const { reevaluator } = compositeReevaluationServices(fixture, admission.stores, admission.policy);

        const result = await reevaluator.reevaluate({
            ...reevaluationRequest(candidate.report.id),
            version: candidate.version,
            currentDecision: admission.reference,
        });

        expect(result.release).toMatchObject({ admissible: false, eligibilityChanged: true });
        const decisions = await admission.stores.decisions.get("demo", candidate.version);
        expect(decisions?.current.statefulChanges.requiredMigrations).toEqual([
            expect.objectContaining({
                source: expect.objectContaining({ kind: "demo", version: "1.0.0" }),
                connectorKey: "primary",
            }),
        ]);
        expect(decisions?.current.reasons).toEqual([expect.stringMatching(/^migration-missing:/)]);
        expect(fixture.snapshots.current().getIndex("demo")?.versions).toContainEqual(
            expect.objectContaining({ version: candidate.version, status: "inadmissible" }),
        );
    });

    test("discovers newly appended migration evidence from the current stateful selection", async () => {
        const fixture = registryFixture();
        const { source, candidate } = await publishMigrationAwareVersionPair(fixture, additiveSchemaContract());
        const admission = await appendDecision(fixture, candidate.version);
        const services = compositeReevaluationServices(fixture, admission.stores, admission.policy);

        const reevaluated = await services.reevaluator.reevaluate({
            ...reevaluationRequest(candidate.report.id),
            version: candidate.version,
            currentDecision: admission.reference,
        });
        expect(reevaluated.release?.admissible).toBeFalse();
        const missing = (await admission.stores.decisions.getHistory("demo", candidate.version))!.current;
        expect(missing.migrationReports).toEqual([]);
        const staleRevision = await migrationReport(
            source.digest,
            candidate.digest,
            missing.statefulChangeSelectionDigest,
            {
                reportId: "migration-for-stale-target-revision",
                migrationRevision: 1,
                policy: missing.policy,
                policySnapshotDigest: missing.policySnapshotDigest,
            },
        );
        await admission.stores.migrationReports.append({ report: staleRevision, expectedCurrent: null });
        const ignored = await services.reconciler.reconcile("demo", candidate.version, {
            actor: "repository:recovery",
            reason: "Ignore evidence for a stale target migration revision",
        });
        expect(ignored).toMatchObject({ decisionChanged: false });
        expect(ignored?.decision.current.admissible).toBeFalse();
        const report = await migrationReport(source.digest, candidate.digest, missing.statefulChangeSelectionDigest, {
            reportId: "migration-after-missing-decision",
            migrationRevision: 2,
            policy: missing.policy,
            policySnapshotDigest: missing.policySnapshotDigest,
        });
        await admission.stores.migrationReports.append({ report, expectedCurrent: null });

        const recovered = await services.reconciler.reconcile("demo", candidate.version, {
            actor: "repository:recovery",
            reason: "Attach current migration evidence",
        });

        expect(recovered?.decisionChanged).toBeTrue();
        expect(recovered?.decision.current).toMatchObject({
            admissible: true,
            migrationReports: [
                {
                    revisionId: report.reportId,
                    migrationRevision: 2,
                    connectorKey: "primary",
                    lineageId: "demo-supabase-v1",
                },
            ],
        });
        expect(
            (
                await services.reconciler.reconcile("demo", candidate.version, {
                    actor: "repository:recovery",
                    reason: "Repeat migration evidence reconciliation",
                })
            )?.decisionChanged,
        ).toBeFalse();
    });

    test("requires an exact current composite decision CAS", async () => {
        const fixture = registryFixture();
        const { candidate } = await publishVersionPair(fixture);
        const admission = await appendDecision(fixture, candidate.version);
        const { reevaluator } = compositeReevaluationServices(fixture, admission.stores, admission.policy);

        const promise = reevaluator.reevaluate({
            ...reevaluationRequest(candidate.report.id),
            currentDecision: { ...admission.reference, digest: "f".repeat(64) },
        });

        await expect(promise).rejects.toBeInstanceOf(IntegrationCompatibilityReevaluationStaleDecisionError);
        expect((await admission.stores.compatibilityReports.get("demo", candidate.version))?.revisions).toHaveLength(1);
    });
});

function additiveSchemaContract() {
    return {
        namespaces: [
            {
                name: "public",
                relations: [
                    {
                        name: "items",
                        columns: [{ name: "label", type: "text", nullable: true }],
                        constraints: [],
                    },
                ],
            },
        ],
    };
}
