import { describe, expect, test } from "bun:test";
import {
    appendReleaseAdmissionDecision,
    identifyReleaseAdmissionDecision,
    parseMigrationReport,
    parseReleaseAdmissionDecision,
} from "../../../src/exports/index";
import { admissionDecision, migrationReport } from "../fixtures";

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
