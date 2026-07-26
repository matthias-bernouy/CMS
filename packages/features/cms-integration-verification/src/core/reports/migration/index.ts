import type { MigrationReport } from "../../../interfaces/reports/migration";
import { MIGRATION_REPORT_SCHEMA } from "../../../interfaces/reports/migration";
import { pinnedRunner, parseVerificationPolicyIdentity } from "../../runner";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertContractIJson, strictRecord } from "../../validation/structure";
import {
    assertVersionInRange,
    oneOf,
    positiveInteger,
    requiredBoolean,
    sha256Digest,
    stableIdentifier,
    supportedVersionRange,
} from "../../validation/values";
import { identifyCanonicalVerificationContract } from "../../verification/shared";
import { parseReportHistoryFields, parseReportProvenance, parseVersionDigestReference } from "../shared";
import { assertMigrationOutcome, parseMigrationChecks, parseMigrationCutover } from "./results";

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
    "policySnapshotDigest",
    "migrationInputDigest",
    "migrationJobResultDigest",
    "statefulChangeSelectionDigest",
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
        policySnapshotDigest: sha256Digest(input.policySnapshotDigest, "migrationReport.policySnapshotDigest"),
        migrationInputDigest: sha256Digest(input.migrationInputDigest, "migrationReport.migrationInputDigest"),
        migrationJobResultDigest: sha256Digest(
            input.migrationJobResultDigest,
            "migrationReport.migrationJobResultDigest",
        ),
        statefulChangeSelectionDigest: sha256Digest(
            input.statefulChangeSelectionDigest,
            "migrationReport.statefulChangeSelectionDigest",
        ),
        environmentDigest: sha256Digest(input.environmentDigest, "migrationReport.environmentDigest"),
        checks: parseMigrationChecks(input.checks),
        cutover: parseMigrationCutover(input.cutover),
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
    assertMigrationOutcome(report);
    return report;
}

export async function identifyMigrationReport(value: unknown) {
    const report = parseMigrationReport(value);
    const identified = await identifyCanonicalVerificationContract(report);
    return { report, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
