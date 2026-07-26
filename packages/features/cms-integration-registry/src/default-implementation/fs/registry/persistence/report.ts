import type { IntegrationCompatibilityAdmissionReport } from "../../../../interfaces/compatibility";
import { isExactIntegrationVersion } from "@bernouy/cms-integrations";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "./canonicalFile";

export const INTEGRATION_COMPATIBILITY_REPORT_DOCUMENT_SCHEMA =
    "cms.integration.registry.compatibility-report.v1" as const;
export const MAX_INTEGRATION_COMPATIBILITY_REPORT_BYTES = 4 * 1_024 * 1_024;

export type IntegrationCompatibilityAdmissionReportDocument = Readonly<{
    schema: typeof INTEGRATION_COMPATIBILITY_REPORT_DOCUMENT_SCHEMA;
    report: IntegrationCompatibilityAdmissionReport;
}>;

export async function writeCompatibilityAdmissionReport(
    path: string,
    report: IntegrationCompatibilityAdmissionReport,
): Promise<void> {
    await writeCanonicalJsonNoReplace(
        path,
        { schema: INTEGRATION_COMPATIBILITY_REPORT_DOCUMENT_SCHEMA, report },
        MAX_INTEGRATION_COMPATIBILITY_REPORT_BYTES,
    );
}

export async function readCompatibilityAdmissionReport(
    path: string,
    expected: Readonly<{ kind: string; version: string; digest: string }>,
): Promise<IntegrationCompatibilityAdmissionReport | null> {
    const value = await readCanonicalJsonFile(path, MAX_INTEGRATION_COMPATIBILITY_REPORT_BYTES);
    if (value === null) {
        return null;
    }
    if (
        !hasExactKeys(value, ["report", "schema"]) ||
        value.schema !== INTEGRATION_COMPATIBILITY_REPORT_DOCUMENT_SCHEMA
    ) {
        throw new Error("Invalid integration compatibility report document schema");
    }
    const report = parseAdmissionReport(value.report);
    if (
        report.kind !== expected.kind ||
        report.version !== expected.version ||
        report.packageDigest !== expected.digest
    ) {
        throw new Error("Integration compatibility report identity does not match its published version");
    }
    return report;
}

export function parseAdmissionReport(value: unknown): IntegrationCompatibilityAdmissionReport {
    const requiredKeys = [
        "admissible",
        "baselines",
        "createdAt",
        "evaluator",
        "evidence",
        "id",
        "informationalBaselines",
        "kind",
        "outcome",
        "packageDigest",
        "releaseLevel",
        "reportType",
        "requiredReleaseLevel",
        "version",
    ];
    if (!isRecord(value) || !hasAllowedKeys(value, requiredKeys, ["noBaselineReason"])) {
        throw new Error("Invalid integration compatibility admission report shape");
    }
    if (
        value.reportType !== "admission" ||
        !isText(value.id) ||
        !isText(value.kind) ||
        !isVersion(value.version) ||
        !isDigest(value.packageDigest) ||
        !isEvaluator(value.evaluator) ||
        !isTimestamp(value.createdAt) ||
        !isBaselines(value.baselines) ||
        !isBaselines(value.informationalBaselines) ||
        !isEvidence(value.evidence) ||
        !isOneOf(value.outcome, ["compatible", "breaking", "unknown", "invalid", "not-applicable"]) ||
        !isOneOf(value.requiredReleaseLevel, ["none", "patch", "minor", "major"]) ||
        !isOneOf(value.releaseLevel, ["initial", "patch", "minor", "major"]) ||
        typeof value.admissible !== "boolean" ||
        (value.noBaselineReason !== undefined && !isOneOf(value.noBaselineReason, ["new-kind", "new-major"]))
    ) {
        throw new Error("Invalid integration compatibility admission report fields");
    }
    return value as IntegrationCompatibilityAdmissionReport;
}

function isEvaluator(value: unknown): boolean {
    return hasExactKeys(value, ["name", "version"]) && isText(value.name) && isText(value.version);
}

function isBaselines(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) =>
                hasExactKeys(entry, ["kind", "packageDigest", "version"]) &&
                isText(entry.kind) &&
                isVersion(entry.version) &&
                isDigest(entry.packageDigest),
        )
    );
}

function isEvidence(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.every(
            (entry) =>
                hasExactKeys(entry, ["classification", "code", "message", "path", "surface"]) &&
                isOneOf(entry.classification, ["compatible", "additive", "breaking", "unknown", "invalid"]) &&
                isOneOf(entry.surface, ["definition", "input", "dependency", "artifact", "schema", "function"]) &&
                isText(entry.code) &&
                isText(entry.path) &&
                isText(entry.message),
        )
    );
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    return isRecord(value) && sameKeys(Object.keys(value), expected);
}

function hasAllowedKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[],
): boolean {
    const keys = Object.keys(value);
    return (
        required.every((key) => keys.includes(key)) &&
        keys.every((key) => required.includes(key) || optional.includes(key))
    );
}

function sameKeys(actual: readonly string[], expected: readonly string[]): boolean {
    return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

function isText(value: unknown): value is string {
    return typeof value === "string" && Boolean(value.trim());
}

function isTimestamp(value: unknown): value is string {
    return isText(value) && Number.isFinite(Date.parse(value));
}

function isDigest(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isVersion(value: unknown): value is string {
    return typeof value === "string" && isExactIntegrationVersion(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
    return typeof value === "string" && values.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
