import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { identifyReviewedSchemaBaseline, type ReviewedSchemaBaselineV1 } from "@bernouy/cms-integration-verification";
import type { ReviewedSchemaBaselineLogicalKey } from "../../../../interfaces/reportStore";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../persistence/canonicalFile";

const IDENTITY_SCHEMA = "cms.integration.registry.reviewed-schema-baseline-identity.v1";
const REVISION_SCHEMA = "cms.integration.registry.reviewed-schema-baseline-revision.v1";
const MAX_IDENTITY_BYTES = 4 * 1_024;
const MAX_REVISION_BYTES = 16 * 1_024 * 1_024;

export type ReviewedSchemaBaselineRevisionDocument = Readonly<{
    ordinal: number;
    baselineDigest: string;
    baseline: ReviewedSchemaBaselineV1;
}>;

export function reviewedSchemaBaselineLogicalKey(baseline: ReviewedSchemaBaselineV1): ReviewedSchemaBaselineLogicalKey {
    return {
        kind: baseline.kind,
        version: baseline.version,
        packageDigest: baseline.packageDigest,
        connectorKey: baseline.connectorKey,
        lineageId: baseline.lineageId,
    };
}

export async function readReviewedSchemaBaselineIdentity(
    path: string,
): Promise<ReviewedSchemaBaselineLogicalKey | null> {
    const value = await readCanonicalJsonFile(path, MAX_IDENTITY_BYTES);
    if (!isRecord(value) || !hasExactKeys(value, ["logicalKey", "schema"]) || value.schema !== IDENTITY_SCHEMA) {
        if (value === null) {
            return null;
        }
        throw new Error(`Invalid reviewed schema baseline identity document: ${path}`);
    }
    return parseLogicalKey(value.logicalKey);
}

export async function writeReviewedSchemaBaselineIdentity(
    path: string,
    logicalKey: ReviewedSchemaBaselineLogicalKey,
): Promise<void> {
    await writeCanonicalJsonNoReplace(
        path,
        { schema: IDENTITY_SCHEMA, logicalKey: parseLogicalKey(logicalKey) },
        MAX_IDENTITY_BYTES,
    );
}

export async function readReviewedSchemaBaselineRevision(
    path: string,
): Promise<ReviewedSchemaBaselineRevisionDocument | null> {
    const value = await readCanonicalJsonFile(path, MAX_REVISION_BYTES);
    if (value === null) {
        return null;
    }
    if (
        !isRecord(value) ||
        !hasExactKeys(value, ["baseline", "baselineDigest", "ordinal", "schema"]) ||
        value.schema !== REVISION_SCHEMA ||
        !Number.isSafeInteger(value.ordinal) ||
        (value.ordinal as number) < 1 ||
        typeof value.baselineDigest !== "string"
    ) {
        throw new Error(`Invalid reviewed schema baseline revision document: ${path}`);
    }
    const identified = await identifyReviewedSchemaBaseline(value.baseline);
    if (identified.digest !== value.baselineDigest) {
        throw new Error(`Reviewed schema baseline revision digest does not match its content: ${path}`);
    }
    return {
        ordinal: value.ordinal as number,
        baselineDigest: identified.digest,
        baseline: identified.baseline,
    };
}

export async function writeReviewedSchemaBaselineRevision(
    path: string,
    ordinal: number,
    baseline: ReviewedSchemaBaselineV1,
): Promise<string> {
    const identified = await identifyReviewedSchemaBaseline(baseline);
    await writeCanonicalJsonNoReplace(
        path,
        { schema: REVISION_SCHEMA, ordinal, baselineDigest: identified.digest, baseline: identified.baseline },
        MAX_REVISION_BYTES,
    );
    return identified.digest;
}

function parseLogicalKey(value: unknown): ReviewedSchemaBaselineLogicalKey {
    if (!isRecord(value) || !hasExactKeys(value, ["connectorKey", "kind", "lineageId", "packageDigest", "version"])) {
        throw new TypeError("Reviewed schema baseline logical key is invalid");
    }
    if (typeof value.kind !== "string" || typeof value.version !== "string") {
        throw new TypeError("Reviewed schema baseline package identity is invalid");
    }
    const kind = value.kind;
    const version = value.version;
    assertIntegrationPackageKind(kind);
    assertIntegrationPackageVersion(version);
    if (typeof value.packageDigest !== "string" || !/^[a-f0-9]{64}$/u.test(value.packageDigest)) {
        throw new TypeError("Reviewed schema baseline package digest is invalid");
    }
    if (!isStableIdentifier(value.connectorKey) || !isStableIdentifier(value.lineageId)) {
        throw new TypeError("Reviewed schema baseline connector identity is invalid");
    }
    return {
        kind,
        version,
        packageDigest: value.packageDigest,
        connectorKey: value.connectorKey,
        lineageId: value.lineageId,
    };
}

function isStableIdentifier(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
