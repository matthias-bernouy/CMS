import type { MigrationEvidencePolicyV1 } from "../../../interfaces/verification";
import type { CompatibilityReleaseLevel } from "../../../interfaces/reports/compatibility";
import type {
    MigrationCheckResult,
    MigrationPolicyEvaluationCheck,
    MigrationReport,
    MigrationReportV4,
    MigrationReportPolicyEvaluation,
} from "../../../interfaces/reports/migration";
import { MIGRATION_REPORT_V4_SCHEMA } from "../../../interfaces/reports/migration";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { migrationExecutionOutcome } from "./results";

const CHECK_ORDER = ["fresh-install", "migrated-state", "equivalence", "failure-injection", "resumption"] as const;

type MigrationCheckName = (typeof CHECK_ORDER)[number];

export function evaluateMigrationReportAgainstPolicy(
    report: MigrationReport,
    policy: MigrationEvidencePolicyV1,
    releaseLevel: CompatibilityReleaseLevel,
): MigrationReportPolicyEvaluation {
    if (releaseLevel === "initial" || !policy.requiredForReleaseLevels.includes(releaseLevel)) {
        return Object.freeze({
            releaseLevel,
            applicable: false,
            satisfied: true,
            checks: Object.freeze([]),
            reasons: Object.freeze([]),
        });
    }
    const checks: MigrationPolicyEvaluationCheck[] = [reportOutcomeCheck(report), environmentCheck(report, policy)];
    for (const name of CHECK_ORDER) {
        if (policy.requiredChecks.includes(name)) {
            checks.push(requiredMigrationCheck(name, report.checks[checkProperty(name)]));
        }
    }
    if (policy.requireCmsMediatedCutoverEvidence) {
        checks.push(
            strategyCheck(
                "cms-mediated-cutover",
                report.cutover.cmsMediated,
                report.schema === MIGRATION_REPORT_V4_SCHEMA ? report.cutoverEvidence.cmsMediated : undefined,
            ),
        );
    }
    if (policy.requireProviderDirectCutoverEvidence) {
        checks.push(
            strategyCheck(
                "provider-direct-cutover",
                report.cutover.providerDirect,
                report.schema === MIGRATION_REPORT_V4_SCHEMA ? report.cutoverEvidence.providerDirect : undefined,
            ),
        );
    }
    if (policy.requireRollbackEvidence) {
        checks.push(rollbackCheck(report.rollback));
    }
    if (policy.requireDelayedCleanupEvidence) {
        checks.push(delayedCleanupCheck(report.delayedCleanupVerified));
    }
    const frozenChecks = Object.freeze(checks.map((check) => Object.freeze(check)));
    const reasons = Object.freeze(
        frozenChecks.flatMap((check) => (check.satisfied || !check.reason ? [] : [check.reason])),
    );
    return Object.freeze({
        releaseLevel,
        applicable: true,
        satisfied: reasons.length === 0,
        checks: frozenChecks,
        reasons,
    });
}

export function assertMigrationReportAgainstPolicy(
    report: MigrationReport,
    policy: MigrationEvidencePolicyV1,
    releaseLevel: CompatibilityReleaseLevel,
): MigrationReportPolicyEvaluation {
    const evaluation = evaluateMigrationReportAgainstPolicy(report, policy, releaseLevel);
    if (evaluation.applicable && !evaluation.satisfied) {
        throw new IntegrationVerificationContractError(
            "invalid_reference",
            `migrationReport does not satisfy migration policy: ${evaluation.reasons.join(", ")}`,
            "migrationReport",
        );
    }
    return evaluation;
}

function reportOutcomeCheck(report: MigrationReport): MigrationPolicyEvaluationCheck {
    const observed = migrationExecutionOutcome(report);
    return {
        check: "report-outcome",
        applicable: true,
        satisfied: observed === "passed",
        observed,
        ...(observed === "passed" ? {} : { reason: `migration-report-${observed}` }),
    };
}

function environmentCheck(report: MigrationReport, policy: MigrationEvidencePolicyV1): MigrationPolicyEvaluationCheck {
    const approved = policy.approvedEnvironmentDigests;
    const satisfied = Boolean(approved?.includes(report.environmentDigest));
    const reason = approved ? "migration-environment-not-approved" : "migration-environment-policy-missing";
    return {
        check: "environment",
        applicable: true,
        satisfied,
        observed: report.environmentDigest,
        ...(satisfied ? {} : { reason }),
    };
}

function requiredMigrationCheck(
    name: MigrationCheckName,
    result: MigrationCheckResult,
): MigrationPolicyEvaluationCheck {
    const optionalNonApplicable =
        (name === "failure-injection" || name === "resumption") && result.outcome === "not-applicable";
    const satisfied = result.outcome === "passed" || optionalNonApplicable;
    return {
        check: name,
        applicable: !optionalNonApplicable,
        satisfied,
        observed: result.outcome,
        ...(satisfied ? {} : { reason: `required-check-${result.outcome}:${name}` }),
    };
}

function strategyCheck(
    check: "cms-mediated-cutover" | "provider-direct-cutover",
    observed: MigrationReport["cutover"]["cmsMediated"] | MigrationReport["cutover"]["providerDirect"],
    evidence: MigrationReportV4["cutoverEvidence"]["cmsMediated"] | undefined,
): MigrationPolicyEvaluationCheck {
    const applicable = observed !== "not-applicable";
    if (!evidence) {
        return {
            check,
            applicable,
            satisfied: !applicable,
            observed,
            ...(applicable ? { reason: `required-check-evidence-not-recorded:${check}` } : {}),
        };
    }
    const satisfied = !applicable || evidence.outcome === "passed";
    return {
        check,
        applicable,
        satisfied,
        observed: evidence.outcome,
        ...(satisfied ? {} : { reason: `required-check-${evidence.outcome}:${check}` }),
    };
}

function rollbackCheck(observed: MigrationReport["rollback"]): MigrationPolicyEvaluationCheck {
    const applicable = observed !== "not-applicable";
    const satisfied = !applicable || observed === "available";
    return {
        check: "rollback",
        applicable,
        satisfied,
        observed,
        ...(satisfied ? {} : { reason: "rollback-evidence-unavailable" }),
    };
}

function delayedCleanupCheck(observed: boolean): MigrationPolicyEvaluationCheck {
    return {
        check: "delayed-cleanup",
        applicable: true,
        satisfied: observed,
        observed,
        ...(observed ? {} : { reason: "delayed-cleanup-evidence-missing" }),
    };
}

function checkProperty(name: MigrationCheckName): keyof MigrationReport["checks"] {
    return {
        "fresh-install": "freshInstall",
        "migrated-state": "migratedState",
        equivalence: "equivalence",
        "failure-injection": "failureInjection",
        resumption: "resumption",
    }[name] as keyof MigrationReport["checks"];
}
