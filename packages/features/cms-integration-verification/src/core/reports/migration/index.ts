import type { MigrationReport } from "../../../interfaces/reports/migration";
import { MIGRATION_REPORT_SCHEMA } from "../../../interfaces/reports/migration";
import { pinnedRunner, parseVerificationPolicyIdentity } from "../../runner";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertContractIJson, strictRecord } from "../../validation/structure";
import {
    assertVersionInRange,
    oneOf,
    positiveInteger,
    sha256Digest,
    stableIdentifier,
    supportedVersionRange,
} from "../../validation/values";
import { identifyCanonicalVerificationContract } from "../../verification/shared";
import { parseReportHistoryFields, parseReportProvenance, parseVersionDigestReference } from "../shared";
import { assertMigrationPolicyEvaluationMatchesReport, parseMigrationPolicyEvaluation } from "./policyEvaluation";
import { assertMigrationOutcome, parseMigrationChecks, parseMigrationCutover } from "./results";
import { parseMigrationOperationalEvidence } from "./operational";
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
    "policyEvaluation",
    "operationalEvidence",
    "cutoverEvidence",
    "outcome",
    "provenance",
] as const;
const FIELDS = ["schema", ...COMMON_FIELDS] as const;

export function parseMigrationReport(value: unknown): MigrationReport {
    assertContractIJson(value);
    const schema = schemaOf(value);
    if (schema !== MIGRATION_REPORT_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `migrationReport.schema must be ${MIGRATION_REPORT_SCHEMA}`,
            "migrationReport.schema",
        );
    }
    const input = strictRecord(value, "migrationReport", FIELDS);
    const report: MigrationReport = {
        schema: MIGRATION_REPORT_SCHEMA,
        ...parseMigrationReportFields(input),
    };
    assertMigrationOutcome(report);
    assertMigrationPolicyEvaluationMatchesReport(report);
    assertMigrationCutoverEvidenceMatchesReport(report);
    return report;
}

function parseMigrationReportFields(input: Record<string, unknown>): Omit<MigrationReport, "schema"> {
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
        policyEvaluation: parseMigrationPolicyEvaluation(input.policyEvaluation),
        operationalEvidence: parseMigrationOperationalEvidence(input.operationalEvidence),
        cutoverEvidence: parseMigrationCutoverEvidence(input.cutoverEvidence),
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
