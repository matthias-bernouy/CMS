import type { MigrationCheckResult, MigrationReport } from "../../interfaces/reports/migration";
import { MIGRATION_REPORT_SCHEMA } from "../../interfaces/reports/migration";
import { pinnedRunner, parseVerificationPolicyIdentity } from "../runner";
import { IntegrationVerificationContractError } from "../validation/errors";
import { assertContractIJson, strictRecord } from "../validation/structure";
import {
    assertVersionInRange,
    oneOf,
    positiveInteger,
    requiredBoolean,
    sha256Digest,
    stableIdentifier,
    supportedVersionRange,
} from "../validation/values";
import { parseReportHistoryFields, parseReportProvenance, parseVersionDigestReference } from "./shared";

const FIELDS = [
    "schema",
    "reportId",
    "revisionType",
    "origin",
    "createdAt",
    "supersedes",
    "source",
    "target",
    "connectorKey",
    "lineageId",
    "migrationRevision",
    "supportedSourceRange",
    "runner",
    "policy",
    "environmentDigest",
    "checks",
    "cutover",
    "rollback",
    "pointOfNoReturn",
    "delayedCleanupVerified",
    "outcome",
    "provenance",
] as const;

export function parseMigrationReport(value: unknown): MigrationReport {
    assertContractIJson(value);
    const input = strictRecord(value, "migrationReport", FIELDS);
    if (input.schema !== MIGRATION_REPORT_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `migrationReport.schema must be ${MIGRATION_REPORT_SCHEMA}`,
            "migrationReport.schema",
        );
    }
    const source = parseVersionDigestReference(input.source, "migrationReport.source");
    const target = parseVersionDigestReference(input.target, "migrationReport.target");
    const supportedSourceRange = supportedVersionRange(
        input.supportedSourceRange,
        "migrationReport.supportedSourceRange",
    );
    assertVersionInRange(source.version, supportedSourceRange, "migrationReport.supportedSourceRange");
    if (source.kind !== target.kind || source.packageDigest === target.packageDigest) {
        throw invalid("migrationReport", "source and target must be different packages of the same kind");
    }
    const report: MigrationReport = {
        schema: MIGRATION_REPORT_SCHEMA,
        ...parseReportHistoryFields(input, "migrationReport"),
        source,
        target,
        connectorKey: stableIdentifier(input.connectorKey, "migrationReport.connectorKey"),
        lineageId: stableIdentifier(input.lineageId, "migrationReport.lineageId"),
        migrationRevision: positiveInteger(input.migrationRevision, "migrationReport.migrationRevision"),
        supportedSourceRange,
        runner: pinnedRunner(input.runner, "migrationReport.runner"),
        policy: parseVerificationPolicyIdentity(input.policy, "migrationReport.policy"),
        environmentDigest: sha256Digest(input.environmentDigest, "migrationReport.environmentDigest"),
        checks: parseChecks(input.checks),
        cutover: parseCutover(input.cutover),
        rollback: oneOf(input.rollback, "migrationReport.rollback", [
            "available",
            "unavailable",
            "not-applicable",
        ] as const),
        pointOfNoReturn: stableIdentifier(input.pointOfNoReturn, "migrationReport.pointOfNoReturn"),
        delayedCleanupVerified: requiredBoolean(input.delayedCleanupVerified, "migrationReport.delayedCleanupVerified"),
        outcome: oneOf(input.outcome, "migrationReport.outcome", [
            "passed",
            "failed",
            "infrastructure-failure",
        ] as const),
        provenance: parseReportProvenance(input.provenance, "migrationReport.provenance"),
    };
    assertOutcome(report);
    return report;
}

function parseChecks(value: unknown): MigrationReport["checks"] {
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

function parseCutover(value: unknown): MigrationReport["cutover"] {
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

function assertOutcome(report: MigrationReport): void {
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

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
