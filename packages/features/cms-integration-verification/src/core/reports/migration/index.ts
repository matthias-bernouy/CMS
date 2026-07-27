import type { LegacyMigrationReportV1, MigrationReport } from "../../../interfaces/reports/migration";
import {
    MIGRATION_REPORT_SCHEMA,
    MIGRATION_REPORT_V2_SCHEMA,
    MIGRATION_REPORT_V3_SCHEMA,
    MIGRATION_REPORT_V4_SCHEMA,
} from "../../../interfaces/reports/migration";
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
import { assertMigrationPolicyEvaluationMatchesReport, parseMigrationPolicyEvaluation } from "./policyEvaluation";
import { assertMigrationOutcome, parseMigrationChecks, parseMigrationCutover } from "./results";
import { assertMigrationOperationalEvidenceMatchesReport, parseMigrationOperationalEvidence } from "./operational";
import { assertMigrationCutoverEvidenceMatchesReport, parseMigrationCutoverEvidence } from "./cutoverEvidence";

const COMMON_FIELDS = [
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
const V1_FIELDS = ["schema", ...COMMON_FIELDS] as const;
const V2_FIELDS = ["schema", ...COMMON_FIELDS, "policyEvaluation"] as const;
const V3_FIELDS = ["schema", ...COMMON_FIELDS, "policyEvaluation", "operationalEvidence"] as const;
const V4_FIELDS = ["schema", ...COMMON_FIELDS, "policyEvaluation", "operationalEvidence", "cutoverEvidence"] as const;

export function parseMigrationReport(value: unknown): MigrationReport {
    assertContractIJson(value);
    const schema = schemaOf(value);
    if (
        schema !== MIGRATION_REPORT_SCHEMA &&
        schema !== MIGRATION_REPORT_V2_SCHEMA &&
        schema !== MIGRATION_REPORT_V3_SCHEMA &&
        schema !== MIGRATION_REPORT_V4_SCHEMA
    ) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `migrationReport.schema must be ${MIGRATION_REPORT_SCHEMA}, ${MIGRATION_REPORT_V2_SCHEMA}, ${MIGRATION_REPORT_V3_SCHEMA}, or ${MIGRATION_REPORT_V4_SCHEMA}`,
            "migrationReport.schema",
        );
    }
    const input = strictRecord(value, "migrationReport", fieldsForSchema(schema));
    const fields = parseMigrationReportFields(input);
    const report: MigrationReport =
        schema === MIGRATION_REPORT_SCHEMA
            ? { schema: MIGRATION_REPORT_SCHEMA, ...fields }
            : schema === MIGRATION_REPORT_V2_SCHEMA
              ? {
                    schema: MIGRATION_REPORT_V2_SCHEMA,
                    ...fields,
                    policyEvaluation: parseMigrationPolicyEvaluation(input.policyEvaluation),
                }
              : schema === MIGRATION_REPORT_V3_SCHEMA
                ? {
                      schema: MIGRATION_REPORT_V3_SCHEMA,
                      ...fields,
                      policyEvaluation: parseMigrationPolicyEvaluation(input.policyEvaluation),
                      operationalEvidence: parseMigrationOperationalEvidence(input.operationalEvidence),
                  }
                : {
                      schema: MIGRATION_REPORT_V4_SCHEMA,
                      ...fields,
                      policyEvaluation: parseMigrationPolicyEvaluation(input.policyEvaluation),
                      operationalEvidence: parseMigrationOperationalEvidence(input.operationalEvidence),
                      cutoverEvidence: parseMigrationCutoverEvidence(input.cutoverEvidence),
                  };
    assertMigrationOutcome(report);
    if (report.schema !== MIGRATION_REPORT_SCHEMA) {
        assertMigrationPolicyEvaluationMatchesReport(report);
    }
    if (report.schema === MIGRATION_REPORT_V3_SCHEMA || report.schema === MIGRATION_REPORT_V4_SCHEMA) {
        assertMigrationOperationalEvidenceMatchesReport(report);
    }
    if (report.schema === MIGRATION_REPORT_V4_SCHEMA) {
        assertMigrationCutoverEvidenceMatchesReport(report);
    }
    return report;
}

function fieldsForSchema(
    schema:
        | typeof MIGRATION_REPORT_SCHEMA
        | typeof MIGRATION_REPORT_V2_SCHEMA
        | typeof MIGRATION_REPORT_V3_SCHEMA
        | typeof MIGRATION_REPORT_V4_SCHEMA,
): readonly string[] {
    if (schema === MIGRATION_REPORT_SCHEMA) {
        return V1_FIELDS;
    }
    if (schema === MIGRATION_REPORT_V2_SCHEMA) {
        return V2_FIELDS;
    }
    return schema === MIGRATION_REPORT_V3_SCHEMA ? V3_FIELDS : V4_FIELDS;
}

function parseMigrationReportFields(input: Record<string, unknown>): Omit<LegacyMigrationReportV1, "schema"> {
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
    return {
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
}

export async function identifyMigrationReport(value: unknown) {
    const report = parseMigrationReport(value);
    const identified = await identifyCanonicalVerificationContract(report);
    return { report, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}

function schemaOf(value: unknown): unknown {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>).schema
        : undefined;
}
