import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationCompatibilityReportHistory,
    assertIntegrationCompatibilityAdmission,
} from "@bernouy/cms-integration-registry";
import { evaluator, packageState } from "./fixtures";

describe("integration compatibility report history", () => {
    test("deep-freezes admission reports and their normalized evidence", () => {
        const report = assertIntegrationCompatibilityAdmission(
            evaluator().evaluateAdmission({
                baseline: packageState("1.0.0"),
                candidate: packageState("1.1.0", {
                    inputs: [{ name: "note", label: "Note", type: "text" }],
                }),
            }),
        );

        expect(Object.isFrozen(report)).toBeTrue();
        expect(Object.isFrozen(report.evaluator)).toBeTrue();
        expect(Object.isFrozen(report.baselines)).toBeTrue();
        expect(Object.isFrozen(report.baselines[0])).toBeTrue();
        expect(Object.isFrozen(report.evidence)).toBeTrue();
        expect(Object.isFrozen(report.evidence[0])).toBeTrue();
        expect(() => {
            (report.evidence as Array<unknown>).push({});
        }).toThrow();
        expect(() => {
            (report.evaluator as { name: string }).name = "mutated";
        }).toThrow();
    });

    test("appends provenance-bearing revisions without mutating admission history", () => {
        const compatibilityEvaluator = evaluator();
        const baseline = packageState("1.0.0");
        const candidate = packageState("1.0.1");
        const admission = assertIntegrationCompatibilityAdmission(
            compatibilityEvaluator.evaluateAdmission({ baseline, candidate }),
        );
        const history = new InMemoryIntegrationCompatibilityReportHistory(admission);
        const adverseCandidate = {
            ...candidate,
            schemaDeclarationEvidence: [
                {
                    evidenceId: "schema-ci-2",
                    packageDigest: candidate.packageDigest,
                    connector: { provider: "supabase" },
                    producer: { name: "schema-verifier", version: "2.0.0" },
                    createdAt: "2026-07-26T11:00:00.000Z",
                    verdict: "contradiction" as const,
                },
            ],
        };
        const revision = compatibilityEvaluator.evaluateRevision(
            { baseline, candidate: adverseCandidate },
            admission.id,
            { actor: "admin:user-1", reason: "Comparator v2 reassessment", evidenceIds: ["schema-ci-2"] },
        );

        history.append(revision);

        expect(history.admission()).not.toBe(admission);
        expect(history.admission()).toEqual(admission);
        expect(history.admission()).toMatchObject({ id: "report-1", admissible: true, outcome: "compatible" });
        expect(history.current()).toMatchObject({
            id: "report-2",
            reportType: "revision",
            supersedes: "report-1",
            outcome: "invalid",
            admissible: false,
            provenance: { actor: "admin:user-1", reason: "Comparator v2 reassessment" },
        });
        expect(history.list().map((report) => report.id)).toEqual(["report-1", "report-2"]);
        expect(Object.isFrozen(history.current())).toBeTrue();
        expect(Object.isFrozen(history.list())).toBeTrue();
    });

    test("rejects stale, duplicate, and cross-package revisions", () => {
        const compatibilityEvaluator = evaluator();
        const baseline = packageState("1.0.0");
        const candidate = packageState("1.0.1");
        const admission = assertIntegrationCompatibilityAdmission(
            compatibilityEvaluator.evaluateAdmission({ baseline, candidate }),
        );
        const history = new InMemoryIntegrationCompatibilityReportHistory(admission);
        const revision = compatibilityEvaluator.evaluateRevision({ baseline, candidate }, admission.id, {
            actor: "admin:user-1",
            reason: "Routine reassessment",
        });
        history.append(revision);

        expect(() => history.append(revision)).toThrow(/supersede current report/);
        const stale = compatibilityEvaluator.evaluateRevision({ baseline, candidate }, admission.id, {
            actor: "admin:user-1",
            reason: "Stale reassessment",
        });
        expect(() => history.append(stale)).toThrow(/supersede current report/);
        const otherPackage = compatibilityEvaluator.evaluateRevision(
            { baseline, candidate: packageState("1.0.2") },
            revision.id,
            { actor: "admin:user-1", reason: "Wrong package" },
        );
        expect(() => history.append(otherPackage)).toThrow(/cannot change the admitted package identity/);
    });
});
