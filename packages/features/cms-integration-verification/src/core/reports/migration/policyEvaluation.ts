import type {
    MigrationPolicyEvaluationCheck,
    MigrationReportPolicyEvaluation,
    MigrationReportV2,
    MigrationReportV3,
} from "../../../interfaces/reports/migration";
import { assertUnique, boundedArray, invalid, strictRecord } from "../../validation/structure";
import { oneOf, requiredBoolean, requiredText } from "../../validation/values";

const CHECK_ORDER = [
    "report-outcome",
    "environment",
    "fresh-install",
    "migrated-state",
    "equivalence",
    "failure-injection",
    "resumption",
    "cms-mediated-cutover",
    "provider-direct-cutover",
    "rollback",
    "delayed-cleanup",
] as const;

export function parseMigrationPolicyEvaluation(value: unknown): MigrationReportPolicyEvaluation {
    const input = strictRecord(value, "migrationReport.policyEvaluation", [
        "releaseLevel",
        "applicable",
        "satisfied",
        "checks",
        "reasons",
    ]);
    const applicable = requiredBoolean(input.applicable, "migrationReport.policyEvaluation.applicable");
    const satisfied = requiredBoolean(input.satisfied, "migrationReport.policyEvaluation.satisfied");
    const checks = boundedArray(input.checks, "migrationReport.policyEvaluation.checks", parseEvaluationCheck, {
        maximum: CHECK_ORDER.length,
    });
    assertUnique(
        checks.map((entry) => entry.check),
        "migrationReport.policyEvaluation.checks",
    );
    assertCanonicalCheckOrder(checks);
    const reasons = boundedArray(
        input.reasons,
        "migrationReport.policyEvaluation.reasons",
        (entry, field) => requiredText(entry, field, 512),
        { maximum: CHECK_ORDER.length },
    );
    const expectedReasons = checks.flatMap((check) => (check.satisfied || !check.reason ? [] : [check.reason]));
    if (
        reasons.length !== expectedReasons.length ||
        reasons.some((reason, index) => reason !== expectedReasons[index]) ||
        satisfied !== (reasons.length === 0)
    ) {
        throw invalid("migrationReport.policyEvaluation", "does not match its exact checks and reasons");
    }
    if (!applicable && (!satisfied || checks.length > 0 || reasons.length > 0)) {
        throw invalid("migrationReport.policyEvaluation", "non-applicable result must be an empty success");
    }
    return Object.freeze({
        releaseLevel: oneOf(input.releaseLevel, "migrationReport.policyEvaluation.releaseLevel", [
            "initial",
            "patch",
            "minor",
            "major",
        ] as const),
        applicable,
        satisfied,
        checks: Object.freeze(checks.map((check) => Object.freeze(check))),
        reasons: Object.freeze(reasons),
    });
}

export function assertMigrationPolicyEvaluationMatchesReport(report: MigrationReportV2 | MigrationReportV3): void {
    if (!report.policyEvaluation.applicable) {
        return;
    }
    const outcome = report.policyEvaluation.checks.find((check) => check.check === "report-outcome");
    const environment = report.policyEvaluation.checks.find((check) => check.check === "environment");
    if (
        !outcome ||
        outcome.observed !== report.outcome ||
        outcome.satisfied !== (report.outcome === "passed") ||
        !environment ||
        environment.observed !== report.environmentDigest
    ) {
        throw invalid("migrationReport.policyEvaluation", "does not bind the report execution outcome and environment");
    }
}

function parseEvaluationCheck(value: unknown, field: string): MigrationPolicyEvaluationCheck {
    const input = strictRecord(value, field, ["check", "applicable", "satisfied", "observed", "reason"]);
    const satisfied = requiredBoolean(input.satisfied, `${field}.satisfied`);
    const reason = input.reason === undefined ? undefined : requiredText(input.reason, `${field}.reason`, 512);
    if (satisfied === Boolean(reason)) {
        throw invalid(`${field}.reason`, "must be present exactly when the check is unsatisfied");
    }
    const observed = input.observed;
    if (typeof observed !== "boolean" && (typeof observed !== "string" || observed.length === 0)) {
        throw invalid(`${field}.observed`, "must be a boolean or non-empty string");
    }
    if (typeof observed === "string") {
        requiredText(observed, `${field}.observed`, 512);
    }
    return {
        check: oneOf(input.check, `${field}.check`, CHECK_ORDER),
        applicable: requiredBoolean(input.applicable, `${field}.applicable`),
        satisfied,
        observed,
        ...(reason ? { reason } : {}),
    };
}

function assertCanonicalCheckOrder(checks: readonly MigrationPolicyEvaluationCheck[]): void {
    let previous = -1;
    for (const check of checks) {
        const current = CHECK_ORDER.indexOf(check.check);
        if (current <= previous) {
            throw invalid("migrationReport.policyEvaluation.checks", "must use canonical policy order");
        }
        previous = current;
    }
}
