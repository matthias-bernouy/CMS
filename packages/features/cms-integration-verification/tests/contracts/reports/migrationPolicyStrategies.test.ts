import { describe, expect, test } from "bun:test";
import {
    assertMigrationReportAgainstPolicy,
    evaluateMigrationReportAgainstPolicy,
    type MigrationEvidencePolicyV1,
    type MigrationReport,
    parseMigrationReport,
} from "../../../src/exports/index";
import { DIGEST_B, migrationReport } from "../fixtures";

describe("migration report policy strategies", () => {
    test("evaluates both cutover regimes only when requested", () => {
        for (const cmsMediated of ["binding-revision", "expand-in-code", "not-applicable"] as const) {
            for (const providerDirect of ["provider-cutover", "expand-in-code", "not-applicable"] as const) {
                const report = parseMigrationReport({
                    ...migrationReport(),
                    cutover: { cmsMediated, providerDirect },
                });
                const evaluation = evaluateMigrationReportAgainstPolicy(
                    report,
                    policy({ cmsCutover: true, providerCutover: true }),
                    "minor",
                );

                expect(evaluation.satisfied).toBe(
                    cmsMediated === "not-applicable" && providerDirect === "not-applicable",
                );
                expect(evaluation.checks.find(({ check }) => check === "cms-mediated-cutover")).toMatchObject({
                    applicable: cmsMediated !== "not-applicable",
                    satisfied: cmsMediated === "not-applicable",
                    observed: cmsMediated,
                });
                expect(evaluation.checks.find(({ check }) => check === "provider-direct-cutover")).toMatchObject({
                    applicable: providerDirect !== "not-applicable",
                    satisfied: providerDirect === "not-applicable",
                    observed: providerDirect,
                });
            }
        }
        const ignored = evaluateMigrationReportAgainstPolicy(
            parseMigrationReport({
                ...migrationReport(),
                cutover: { cmsMediated: "not-applicable", providerDirect: "not-applicable" },
            }),
            policy({}),
            "minor",
        );
        expect(ignored.checks.map(({ check }) => check)).not.toContain("cms-mediated-cutover");
        expect(ignored.checks.map(({ check }) => check)).not.toContain("provider-direct-cutover");
    });

    test("requires rollback only for an applicable strategy under a strict policy", () => {
        for (const rollback of ["available", "unavailable", "not-applicable"] as const) {
            const evaluation = evaluateMigrationReportAgainstPolicy(
                parseMigrationReport({ ...migrationReport(), rollback }),
                policy({ rollback: true }),
                "minor",
            );
            const applicable = rollback !== "not-applicable";
            const satisfied = rollback !== "unavailable";

            expect(evaluation.checks.find(({ check }) => check === "rollback")).toMatchObject({
                applicable,
                satisfied,
                observed: rollback,
            });
            expect(evaluation.satisfied).toBe(satisfied);
        }
    });

    test("fails closed when v4 records declared cutovers as unsupported", () => {
        const legacy = parseMigrationReport(migrationReport());
        const permissivePolicy = policy({});
        const report = parseMigrationReport({
            ...legacy,
            schema: "cms.integration.migration-report.v4",
            policyEvaluation: evaluateMigrationReportAgainstPolicy(legacy, permissivePolicy, "minor"),
            operationalEvidence: {
                downtime: { status: "not-measured" },
                drain: {},
                rollback: { capability: legacy.rollback, verified: false },
                pointOfNoReturn: { phase: legacy.pointOfNoReturn, observation: "not-observed" },
                cleanup: { observed: legacy.delayedCleanupVerified, evidenceDigest: DIGEST_B },
            },
            cutoverEvidence: {
                cmsMediated: { outcome: "not-supported" },
                providerDirect: { outcome: "not-supported" },
                activation: { outcome: "not-supported" },
            },
        });
        const strict = evaluateMigrationReportAgainstPolicy(
            report,
            policy({ cmsCutover: true, providerCutover: true }),
            "minor",
        );

        expect(strict).toMatchObject({
            applicable: true,
            satisfied: false,
            reasons: [
                "required-check-not-supported:cms-mediated-cutover",
                "required-check-not-supported:provider-direct-cutover",
            ],
        });
        expect(strict.checks.find(({ check }) => check === "cms-mediated-cutover")).toMatchObject({
            applicable: true,
            satisfied: false,
            observed: "not-supported",
        });
        expect(evaluateMigrationReportAgainstPolicy(report, permissivePolicy, "minor").checks).not.toContainEqual(
            expect.objectContaining({ check: "cms-mediated-cutover" }),
        );
    });

    test("accepts both legacy and current cleanup outcomes, then applies the selected policy", () => {
        const current = parseMigrationReport({
            ...migrationReport(),
            delayedCleanupVerified: false,
            outcome: "passed",
        });
        const legacy = parseMigrationReport({ ...migrationReport(), delayedCleanupVerified: false, outcome: "failed" });

        for (const report of [current, legacy]) {
            expect(evaluateMigrationReportAgainstPolicy(report, policy({}), "minor")).toMatchObject({
                applicable: true,
                satisfied: true,
                reasons: [],
            });
            expect(evaluateMigrationReportAgainstPolicy(report, policy({ cleanup: true }), "minor")).toMatchObject({
                applicable: true,
                satisfied: false,
                reasons: ["delayed-cleanup-evidence-missing"],
            });
        }
    });

    test("returns deterministic checks and reasons and exposes a fail-closed assertion", () => {
        const report = parseMigrationReport({
            ...migrationReport(),
            rollback: "unavailable",
            delayedCleanupVerified: false,
            outcome: "passed",
        });
        const first = evaluateMigrationReportAgainstPolicy(
            report,
            policy({
                requiredChecks: ["resumption", "failure-injection", "equivalence", "migrated-state", "fresh-install"],
                rollback: true,
                cleanup: true,
            }),
            "minor",
        );
        const second = evaluateMigrationReportAgainstPolicy(
            report,
            policy({
                requiredChecks: ["fresh-install", "migrated-state", "equivalence", "failure-injection", "resumption"],
                rollback: true,
                cleanup: true,
            }),
            "minor",
        );

        expect(first).toEqual(second);
        expect(first.reasons).toEqual([
            "required-check-not-supported:failure-injection",
            "required-check-not-supported:resumption",
            "rollback-evidence-unavailable",
            "delayed-cleanup-evidence-missing",
        ]);
        expect(() =>
            assertMigrationReportAgainstPolicy(
                report,
                policy({ requiredChecks: ["resumption"], rollback: true, cleanup: true }),
                "minor",
            ),
        ).toThrow(/required-check-not-supported:resumption.*rollback-evidence-unavailable.*delayed-cleanup/);
    });
});

function policy(
    options: Readonly<{
        requiredChecks?: MigrationEvidencePolicyV1["requiredChecks"];
        cmsCutover?: boolean;
        providerCutover?: boolean;
        rollback?: boolean;
        cleanup?: boolean;
    }>,
): MigrationEvidencePolicyV1 {
    return {
        requiredForReleaseLevels: ["minor"],
        requiredChecks: options.requiredChecks ?? ["fresh-install", "migrated-state", "equivalence"],
        requireExactSourcePackageDigest: true,
        requireExactTargetPackageDigest: true,
        approvedEnvironmentDigests: [DIGEST_B],
        requireCmsMediatedCutoverEvidence: options.cmsCutover ?? false,
        requireProviderDirectCutoverEvidence: options.providerCutover ?? false,
        requireRollbackEvidence: options.rollback ?? false,
        requireDelayedCleanupEvidence: options.cleanup ?? false,
    };
}
