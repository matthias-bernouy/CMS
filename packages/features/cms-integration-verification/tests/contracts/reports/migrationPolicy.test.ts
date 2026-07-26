import { describe, expect, test } from "bun:test";
import type { MigrationEvidencePolicyV1, MigrationReport } from "../../../src/exports/index";
import { evaluateMigrationReportAgainstPolicy, parseMigrationReport } from "../../../src/exports/index";
import { DIGEST_B, DIGEST_C, migrationReport } from "../fixtures";

const CHECKS = [
    ["fresh-install", "freshInstall"],
    ["migrated-state", "migratedState"],
    ["equivalence", "equivalence"],
    ["failure-injection", "failureInjection"],
    ["resumption", "resumption"],
] as const;
const OUTCOMES = ["passed", "failed", "not-supported", "not-applicable", "infrastructure-failure"] as const;

describe("migration report policy checks", () => {
    test("distinguishes a policy that does not apply to the release level", () => {
        const failed = reportWithCheck("freshInstall", "failed");
        const evaluation = evaluateMigrationReportAgainstPolicy(failed, policy(["fresh-install"]), "patch");

        expect(evaluation).toEqual({
            releaseLevel: "patch",
            applicable: false,
            satisfied: true,
            checks: [],
            reasons: [],
        });
        expect(Object.isFrozen(evaluation)).toBeTrue();
    });

    test("evaluates every required check outcome and never accepts not-supported", () => {
        for (const [name, property] of CHECKS) {
            for (const outcome of OUTCOMES) {
                const report = reportWithCheck(property, outcome);
                const evaluation = evaluateMigrationReportAgainstPolicy(report, policy([name]), "minor");
                const check = evaluation.checks.find((candidate) => candidate.check === name)!;
                const optionalNonApplicable =
                    (name === "failure-injection" || name === "resumption") && outcome === "not-applicable";
                const expected = outcome === "passed" || optionalNonApplicable;

                expect(check).toMatchObject({
                    applicable: !optionalNonApplicable,
                    satisfied: expected,
                    observed: outcome,
                });
                expect(evaluation.satisfied).toBe(expected);
                if (outcome === "not-supported") {
                    expect(evaluation.reasons).toContain(`required-check-not-supported:${name}`);
                }
            }
        }
    });

    test("ignores optional unsupported checks unless the policy requires them", () => {
        const report = parseMigrationReport(migrationReport());
        const coreOnly = evaluateMigrationReportAgainstPolicy(
            report,
            policy(["fresh-install", "migrated-state", "equivalence"]),
            "minor",
        );
        const resumptionRequired = evaluateMigrationReportAgainstPolicy(
            report,
            policy(["fresh-install", "migrated-state", "equivalence", "resumption"]),
            "minor",
        );

        expect(coreOnly).toMatchObject({ applicable: true, satisfied: true, reasons: [] });
        expect(coreOnly.checks.map(({ check }) => check)).not.toContain("resumption");
        expect(resumptionRequired).toMatchObject({
            applicable: true,
            satisfied: false,
            reasons: ["required-check-not-supported:resumption"],
        });
    });

    test("fails closed when an applicable policy omits or rejects the pinned environment", () => {
        const report = parseMigrationReport(migrationReport());
        const approved = policy(["fresh-install", "migrated-state", "equivalence"]);
        const historical = { ...approved, approvedEnvironmentDigests: undefined };
        const rejected = { ...approved, approvedEnvironmentDigests: ["f".repeat(64)] };

        expect(evaluateMigrationReportAgainstPolicy(report, historical, "minor")).toMatchObject({
            satisfied: false,
            reasons: ["migration-environment-policy-missing"],
        });
        expect(evaluateMigrationReportAgainstPolicy(report, rejected, "minor")).toMatchObject({
            satisfied: false,
            reasons: ["migration-environment-not-approved"],
        });
        expect(evaluateMigrationReportAgainstPolicy(report, approved, "minor")).toMatchObject({
            satisfied: true,
            reasons: [],
        });
    });
});

function reportWithCheck(
    property: keyof MigrationReport["checks"],
    outcome: MigrationReport["checks"][keyof MigrationReport["checks"]]["outcome"],
): MigrationReport {
    const base = migrationReport();
    const check = {
        outcome,
        ...(outcome === "passed" || outcome === "failed" ? { evidenceDigest: DIGEST_C } : {}),
    };
    const checks = { ...base.checks, [property]: check };
    const core = property === "freshInstall" || property === "migratedState" || property === "equivalence";
    const reportOutcome =
        outcome === "infrastructure-failure"
            ? "infrastructure-failure"
            : outcome === "failed" || (core && outcome !== "passed")
              ? "failed"
              : "passed";
    return parseMigrationReport({ ...base, checks, outcome: reportOutcome });
}

function policy(requiredChecks: MigrationEvidencePolicyV1["requiredChecks"]): MigrationEvidencePolicyV1 {
    return {
        requiredForReleaseLevels: ["minor"],
        requiredChecks,
        requireExactSourcePackageDigest: true,
        requireExactTargetPackageDigest: true,
        approvedEnvironmentDigests: [DIGEST_B],
        requireCmsMediatedCutoverEvidence: false,
        requireProviderDirectCutoverEvidence: false,
        requireRollbackEvidence: false,
        requireDelayedCleanupEvidence: false,
    };
}
