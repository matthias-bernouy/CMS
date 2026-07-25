import type { SourceImageDerivative, SourceImageLookup } from "../../interfaces/cache";

export const DERIVATIVE_SCHEMA = "cms.source-image.derivative.v1";
export const LOOKUP_SCHEMA = "cms.source-image.lookup.v1";

export type DerivativeDiskRecord = {
    schema: typeof DERIVATIVE_SCHEMA;
    keyDigest: string;
    dataFile: string;
    byteSha256: string;
    etag: string;
    contentType: "image/webp";
    width: number;
    height: number;
    size: number;
    createdAt: number;
};

export type LookupDiskRecord = {
    schema: typeof LOOKUP_SCHEMA;
    keyDigest: string;
    derivativeKey: string;
    freshUntil: number;
    createdAt: number;
};

export function derivativeRecord(
    value: SourceImageDerivative,
    keyDigest: string,
    byteSha256: string,
): DerivativeDiskRecord {
    return {
        schema: DERIVATIVE_SCHEMA,
        keyDigest,
        dataFile: `${keyDigest}-${byteSha256}.webp`,
        byteSha256,
        etag: value.etag,
        contentType: "image/webp",
        width: value.width,
        height: value.height,
        size: value.bytes.byteLength,
        createdAt: value.createdAt,
    };
}

export function lookupRecord(value: SourceImageLookup, keyDigest: string): LookupDiskRecord {
    return { schema: LOOKUP_SCHEMA, keyDigest, ...value };
}

export function parseDerivativeRecord(value: unknown): DerivativeDiskRecord | null {
    if (!isRecord(value) || value.schema !== DERIVATIVE_SCHEMA) {
        return null;
    }
    const record = value as Partial<DerivativeDiskRecord>;
    if (
        !isDigest(record.keyDigest) ||
        !isDigest(record.byteSha256) ||
        record.dataFile !== `${record.keyDigest}-${record.byteSha256}.webp` ||
        record.etag !== `"sha256-${record.byteSha256}"` ||
        record.contentType !== "image/webp" ||
        !positiveInteger(record.width) ||
        !positiveInteger(record.height) ||
        !nonNegativeInteger(record.size) ||
        !nonNegativeFinite(record.createdAt)
    ) {
        return null;
    }
    return record as DerivativeDiskRecord;
}

export function parseLookupRecord(value: unknown): LookupDiskRecord | null {
    if (!isRecord(value) || value.schema !== LOOKUP_SCHEMA) {
        return null;
    }
    const record = value as Partial<LookupDiskRecord>;
    if (
        !isDigest(record.keyDigest) ||
        typeof record.derivativeKey !== "string" ||
        !/^[a-z]+-[a-f0-9]{64}$/.test(record.derivativeKey) ||
        !nonNegativeFinite(record.freshUntil) ||
        !nonNegativeFinite(record.createdAt)
    ) {
        return null;
    }
    return record as LookupDiskRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDigest(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function positiveInteger(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) >= 0;
}

function nonNegativeFinite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
