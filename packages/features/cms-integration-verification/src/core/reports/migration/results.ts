import type { MigrationCheckResult, MigrationReport } from "../../../interfaces/reports/migration";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { strictRecord } from "../../validation/structure";
import { oneOf, sha256Digest } from "../../validation/values";

export function parseMigrationChecks(value: unknown): MigrationReport["checks"] {
    const input = strictRecord(value, "migrationReport.checks", [
        "freshInstall",
        "migratedState",
        "equivalence",
        "failureInjection",
        "resumption",
    ]);
    return {
        freshInstall: parseCheck(input.freshInstall, "migrationReport.checks.freshInstall"),
        migratedState: parseCheck(input.migratedState, "migrationReport.checks.migratedState"),
        equivalence: parseCheck(input.equivalence, "migrationReport.checks.equivalence"),
        failureInjection: parseCheck(input.failureInjection, "migrationReport.checks.failureInjection"),
        resumption: parseCheck(input.resumption, "migrationReport.checks.resumption"),
    };
}

export function parseMigrationCutover(value: unknown): MigrationReport["cutover"] {
    const input = strictRecord(value, "migrationReport.cutover", ["cmsMediated", "providerDirect"]);
    return {
        cmsMediated: oneOf(input.cmsMediated, "migrationReport.cutover.cmsMediated", [
            "binding-revision",
            "expand-in-code",
            "not-applicable",
        ] as const),
        providerDirect: oneOf(input.providerDirect, "migrationReport.cutover.providerDirect", [
            "provider-cutover",
            "expand-in-code",
            "not-applicable",
        ] as const),
    };
}

export function assertMigrationOutcome(report: MigrationReport): void {
    const checks = Object.values(report.checks);
    const expected = checks.some((check) => check.outcome === "infrastructure-failure")
        ? "infrastructure-failure"
        : report.checks.freshInstall.outcome !== "passed" ||
            report.checks.migratedState.outcome !== "passed" ||
            report.checks.equivalence.outcome !== "passed" ||
            checks.some((check) => check.outcome === "failed") ||
            !report.delayedCleanupVerified
          ? "failed"
          : "passed";
    if (report.outcome !== expected) {
        throw invalid("migrationReport.outcome", `must be ${expected} for the recorded migration checks`);
    }
}

function parseCheck(value: unknown, field: string): MigrationCheckResult {
    const input = strictRecord(value, field, ["outcome", "evidenceDigest"]);
    const outcome = oneOf(input.outcome, `${field}.outcome`, [
        "passed",
        "failed",
        "not-supported",
        "not-applicable",
        "infrastructure-failure",
    ] as const);
    const evidenceDigest =
        input.evidenceDigest === undefined ? undefined : sha256Digest(input.evidenceDigest, `${field}.evidenceDigest`);
    if ((outcome === "passed" || outcome === "failed") && evidenceDigest === undefined) {
        throw invalid(`${field}.evidenceDigest`, `is required for ${outcome}`);
    }
    return { outcome, ...(evidenceDigest ? { evidenceDigest } : {}) };
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
