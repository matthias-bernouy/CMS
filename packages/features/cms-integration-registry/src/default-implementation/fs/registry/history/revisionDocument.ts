import type { IntegrationCompatibilityReportRevision } from "../../../../interfaces/compatibility";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../persistence/canonicalFile";
import { parseAdmissionReport } from "../persistence/report";

export const INTEGRATION_COMPATIBILITY_REVISION_DOCUMENT_SCHEMA =
    "cms.integration.registry.compatibility-revision.v1" as const;
export const MAX_INTEGRATION_COMPATIBILITY_REVISION_BYTES = 4 * 1_024 * 1_024;

export async function readCompatibilityRevision(path: string): Promise<IntegrationCompatibilityReportRevision | null> {
    const value = await readCanonicalJsonFile(path, MAX_INTEGRATION_COMPATIBILITY_REVISION_BYTES);
    if (value === null) {
        return null;
    }
    if (
        !hasExactKeys(value, ["report", "schema"]) ||
        value.schema !== INTEGRATION_COMPATIBILITY_REVISION_DOCUMENT_SCHEMA
    ) {
        throw new Error(`Invalid integration compatibility revision document: ${path}`);
    }
    return parseCompatibilityRevision(value.report);
}

export async function writeCompatibilityRevision(
    path: string,
    report: IntegrationCompatibilityReportRevision,
): Promise<void> {
    await writeCanonicalJsonNoReplace(
        path,
        { schema: INTEGRATION_COMPATIBILITY_REVISION_DOCUMENT_SCHEMA, report: parseCompatibilityRevision(report) },
        MAX_INTEGRATION_COMPATIBILITY_REVISION_BYTES,
    );
}

export function parseCompatibilityRevision(value: unknown): IntegrationCompatibilityReportRevision {
    if (
        !isRecord(value) ||
        value.reportType !== "revision" ||
        !isText(value.supersedes) ||
        !isProvenance(value.provenance)
    ) {
        throw new Error("Invalid integration compatibility revision fields");
    }
    const { supersedes, provenance, ...base } = value;
    const admission = parseAdmissionReport({ ...base, reportType: "admission" });
    return { ...admission, reportType: "revision", supersedes, provenance };
}

function isProvenance(value: unknown): value is IntegrationCompatibilityReportRevision["provenance"] {
    if (!isRecord(value) || !hasAllowedKeys(value, ["actor", "reason"], ["evidenceIds"])) {
        return false;
    }
    return (
        isText(value.actor) &&
        isText(value.reason) &&
        (value.evidenceIds === undefined ||
            (Array.isArray(value.evidenceIds) && value.evidenceIds.every((entry) => isText(entry))))
    );
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    return isRecord(value) && Object.keys(value).length === expected.length && expected.every((key) => key in value);
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isText(value: unknown): value is string {
    return typeof value === "string" && Boolean(value.trim());
}
