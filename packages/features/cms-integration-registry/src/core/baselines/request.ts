import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { identifyReviewedSchemaBaseline } from "@bernouy/cms-integration-verification";
import {
    REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA,
    type IdentifiedReviewedSchemaBaselineImportRequest,
    type ReviewedSchemaBaselineImportCurrent,
    type ReviewedSchemaBaselineImportRequest,
} from "../../interfaces/reportStore";

const REQUEST_FIELDS = ["baseline", "baselineDigest", "expectedCurrent", "schema"] as const;

export async function identifyReviewedSchemaBaselineImportRequest(
    value: unknown,
): Promise<IdentifiedReviewedSchemaBaselineImportRequest> {
    const request = await parseReviewedSchemaBaselineImportRequest(value);
    const canonicalBytes = canonicalJsonBytes(request);
    return Object.freeze({ request, canonicalBytes, digest: await sha256Hex(canonicalBytes) });
}

export async function parseReviewedSchemaBaselineImportRequest(
    value: unknown,
): Promise<ReviewedSchemaBaselineImportRequest> {
    const input = strictRecord(value, "reviewed schema baseline import", REQUEST_FIELDS);
    if (input.schema !== REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA) {
        throw new TypeError("Reviewed schema baseline import schema is invalid");
    }
    const identified = await identifyReviewedSchemaBaseline(input.baseline);
    if (input.baselineDigest !== identified.digest) {
        throw new TypeError("Reviewed schema baseline import digest does not match its baseline");
    }
    return Object.freeze({
        schema: REVIEWED_SCHEMA_BASELINE_IMPORT_SCHEMA,
        baselineDigest: identified.digest,
        baseline: identified.baseline,
        expectedCurrent: parseExpectedCurrent(input.expectedCurrent),
    });
}

function parseExpectedCurrent(value: unknown): ReviewedSchemaBaselineImportCurrent | null {
    if (value === null) {
        return null;
    }
    const input = strictRecord(value, "reviewed schema baseline import expected current", [
        "baselineDigest",
        "revisionId",
    ]);
    if (!isStableIdentifier(input.revisionId) || !isDigest(input.baselineDigest)) {
        throw new TypeError("Reviewed schema baseline import expected current revision is invalid");
    }
    return Object.freeze({ revisionId: input.revisionId, baselineDigest: input.baselineDigest });
}

function strictRecord(value: unknown, source: string, fields: readonly string[]): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`${source} must be an object`);
    }
    const input = value as Record<string, unknown>;
    const keys = Object.keys(input);
    if (keys.length !== fields.length || fields.some((field) => !keys.includes(field))) {
        throw new TypeError(`${source} has unknown or missing fields`);
    }
    return input;
}

function isStableIdentifier(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function isDigest(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
