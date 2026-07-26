import { describe, expect, test } from "bun:test";
import {
    appendReleaseAdmissionDecision,
    evaluateMigrationReportAgainstPolicy,
    identifyReleaseAdmissionDecision,
    parseMigrationReport,
    parseReleaseAdmissionDecision,
} from "../../../src/exports/index";
import { admissionDecision, DIGEST_B, migrationReport } from "../fixtures";

describe("migration report contract", () => {
    test("binds source, target, migration evidence, and both traffic regimes", () => {
        const parsed = parseMigrationReport(migrationReport());

        expect(parsed.source.version).toBe("1.1.0");
        expect(parsed.target.version).toBe("1.2.0");
        expect(parsed.cutover.cmsMediated).toBe("binding-revision");
        expect(parsed.cutover.providerDirect).toBe("expand-in-code");
        expect(parsed.policySnapshotDigest).toHaveLength(64);
        expect(parsed.migrationInputDigest).toHaveLength(64);
        expect(parsed.migrationJobResultDigest).toHaveLength(64);
    });

    test("fails closed on an unsupported source or inconsistent overall result", () => {
        const value = migrationReport();
        expect(() => parseMigrationReport({ ...value, supportedSourceRange: "^2.0.0" })).toThrow(
            /does not include version 1.1.0/,
        );
        expect(() =>
            parseMigrationReport({
                ...value,
                checks: { ...value.checks, equivalence: { outcome: "failed", evidenceDigest: "c".repeat(64) } },
                outcome: "passed",
            }),
        ).toThrow(/must be failed/);
    });

    test("supports honest backfill roots and linked revisions", () => {
        const root = parseMigrationReport({ ...migrationReport(), origin: "legacy-backfill" });
        const revision = parseMigrationReport({
            ...root,
            reportId: "migration-2",
            revisionType: "revision",
            supersedes: root.reportId,
        });

        expect(root.supersedes).toBeUndefined();
        expect(revision.supersedes).toBe(root.reportId);
    });

    test("reads legacy v1 reports and binds v2 reports to a durable policy evaluation", () => {
        const legacy = parseMigrationReport(migrationReport());
        const policyEvaluation = evaluateMigrationReportAgainstPolicy(
            legacy,
            {
                requiredForReleaseLevels: ["minor"],
                requiredChecks: ["fresh-install", "migrated-state", "equivalence"],
                requireExactSourcePackageDigest: true,
                requireExactTargetPackageDigest: true,
                approvedEnvironmentDigests: [DIGEST_B],
                requireCmsMediatedCutoverEvidence: true,
                requireProviderDirectCutoverEvidence: true,
                requireRollbackEvidence: false,
                requireDelayedCleanupEvidence: false,
            },
            "minor",
        );
        const current = parseMigrationReport({
            ...legacy,
            schema: "cms.integration.migration-report.v2",
            policyEvaluation,
        });

        expect(legacy.schema).toBe("cms.integration.migration-report.v1");
        expect(current).toMatchObject({
            schema: "cms.integration.migration-report.v2",
            policyEvaluation: { releaseLevel: "minor", applicable: true, satisfied: true, reasons: [] },
        });
        expect(() =>
            parseMigrationReport({
                ...current,
                policyEvaluation: { ...policyEvaluation, reasons: ["fabricated-denial"], satisfied: false },
            }),
        ).toThrow(/exact checks and reasons/);
        expect(() =>
            parseMigrationReport({
                ...current,
                policyEvaluation: {
                    ...policyEvaluation,
                    checks: policyEvaluation.checks.map((check) =>
                        check.check === "environment" ? { ...check, observed: "f".repeat(64) } : check,
                    ),
                },
            }),
        ).toThrow(/execution outcome and environment/);
    });

    test("binds v3 operational facts without fabricating downtime or rollback evidence", () => {
        const legacy = parseMigrationReport(migrationReport());
        const policyEvaluation = evaluateMigrationReportAgainstPolicy(
            legacy,
            {
                requiredForReleaseLevels: ["minor"],
                requiredChecks: ["fresh-install", "migrated-state", "equivalence"],
                requireExactSourcePackageDigest: true,
                requireExactTargetPackageDigest: true,
                approvedEnvironmentDigests: [DIGEST_B],
                requireCmsMediatedCutoverEvidence: true,
                requireProviderDirectCutoverEvidence: true,
                requireRollbackEvidence: false,
                requireDelayedCleanupEvidence: false,
            },
            "minor",
        );
        const operationalEvidence = {
            downtime: { status: "not-measured" as const },
            drain: { cmsMediatedSeconds: 30, providerDirectSeconds: 60 },
            rollback: {
                capability: legacy.rollback,
                verified: true,
                evidenceDigest: DIGEST_B,
            },
            pointOfNoReturn: {
                phase: legacy.pointOfNoReturn,
                observation: "crossed" as const,
                evidenceDigest: DIGEST_B,
            },
            cleanup: { delaySeconds: 60, observed: true, evidenceDigest: DIGEST_B },
        };
        const current = parseMigrationReport({
            ...legacy,
            schema: "cms.integration.migration-report.v3",
            policyEvaluation,
            operationalEvidence,
        });

        expect(current).toMatchObject({
            schema: "cms.integration.migration-report.v3",
            operationalEvidence: {
                downtime: { status: "not-measured" },
                drain: { cmsMediatedSeconds: 30, providerDirectSeconds: 60 },
                rollback: { capability: "available", verified: true },
                pointOfNoReturn: { phase: "cleanup", observation: "crossed" },
                cleanup: { delaySeconds: 60, observed: true },
            },
        });
        expect(() =>
            parseMigrationReport({
                ...current,
                operationalEvidence: {
                    ...operationalEvidence,
                    downtime: { status: "not-measured", observedSeconds: 0 },
                },
            }),
        ).toThrow(/must not fabricate/);
        expect(() =>
            parseMigrationReport({
                ...current,
                operationalEvidence: {
                    ...operationalEvidence,
                    rollback: { capability: "unavailable", verified: false },
                },
            }),
        ).toThrow(/must match the report/);
        expect(
            parseMigrationReport({
                ...current,
                rollback: "available",
                operationalEvidence: {
                    ...operationalEvidence,
                    rollback: { capability: "available", verified: false },
                },
            }),
        ).toMatchObject({ operationalEvidence: { rollback: { capability: "available", verified: false } } });
        expect(() =>
            parseMigrationReport({
                ...current,
                rollback: "unavailable",
                operationalEvidence: {
                    ...operationalEvidence,
                    rollback: { capability: "unavailable", verified: true, evidenceDigest: DIGEST_B },
                },
            }),
        ).toThrow(/verified rollback requires available capability/);
    });
});

describe("composite release admission decisions", () => {
    test("is the append-only global truth referencing exact report revisions", () => {
        const root = parseReleaseAdmissionDecision(admissionDecision());
        const revision = parseReleaseAdmissionDecision({
            ...root,
            decisionId: "decision-2",
            revisionType: "revision",
            supersedes: root.decisionId,
            admissible: false,
            reasons: ["verification-report-failed"],
        });
        const history = appendReleaseAdmissionDecision([root], revision);

        expect(history).toHaveLength(2);
        expect(history[1]?.verificationReport?.revisionId).toBe("verification-1");
        expect(history[1]?.provenance.actor).toBe("repository-ci");
        expect(Object.isFrozen(history)).toBeTrue();
    });

    test("rejects stale links, changed release identity, and unexplained denial", () => {
        const root = parseReleaseAdmissionDecision(admissionDecision());
        const revision = parseReleaseAdmissionDecision({
            ...root,
            decisionId: "decision-2",
            revisionType: "revision",
            supersedes: root.decisionId,
        });

        expect(() => appendReleaseAdmissionDecision([root], { ...revision, supersedes: "decision-stale" })).toThrow(
            /current decision exactly/,
        );
        expect(() => appendReleaseAdmissionDecision([root], { ...revision, version: "1.3.0" })).toThrow(
            /cannot change the release identity/,
        );
        expect(() => parseReleaseAdmissionDecision({ ...root, admissible: false, reasons: [] })).toThrow(
            /must explain an inadmissible decision/,
        );
    });

    test("binds the decision digest to its embedded trusted stateful-change selection", async () => {
        const value = admissionDecision();
        await expect(identifyReleaseAdmissionDecision(value)).rejects.toThrow(/statefulChangeSelectionDigest/);
    });
});
