import type { Stats } from "node:fs";
import { canonicalJsonBytes } from "../../../../core/canonical/canonicalizeJson";
import { resolveIntegrationPackageLimits } from "../../../../core/envelope/constants";
import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "../../../../core/envelope/identity";
import { parseStrictPackageJson } from "../../../../core/envelope/strictJson";
import { INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA, type IntegrationPackageCacheReference } from "../types";

export const MAX_REFERENCE_BYTES = 1_024;
const REFERENCE_FIELDS = new Set(["schema", "kind", "version", "digest"]);

export type ReferenceCoordinate = {
    kind: string;
    version: string;
    digest?: string;
};

export function validateReferenceCoordinate(kind: unknown, version: unknown, digest?: unknown): ReferenceCoordinate {
    const coordinate: ReferenceCoordinate = {
        kind: assertIntegrationPackageKind(kind),
        version: assertIntegrationPackageVersion(version),
    };
    if (digest !== undefined) {
        if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
            throw new TypeError("Integration package digest must be lowercase hexadecimal SHA-256");
        }
        coordinate.digest = digest;
    }
    return coordinate;
}

export function createPackageReference(coordinate: ReferenceCoordinate): IntegrationPackageCacheReference {
    if (!coordinate.digest) {
        throw new TypeError("Integration package cache reference requires a digest");
    }
    return {
        schema: INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA,
        kind: coordinate.kind,
        version: coordinate.version,
        digest: coordinate.digest,
    };
}

export function parsePackageReference(
    document: Uint8Array,
    expected: ReferenceCoordinate,
): IntegrationPackageCacheReference {
    const input = parseStrictPackageJson(
        document,
        resolveIntegrationPackageLimits({ maxDocumentBytes: MAX_REFERENCE_BYTES }),
    );
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("reference must be an object");
    }
    const value = input as Record<string, unknown>;
    if (Object.keys(value).some((field) => !REFERENCE_FIELDS.has(field)) || Object.keys(value).length !== 4) {
        throw new Error("reference must contain exactly schema, kind, version, and digest");
    }
    if (value.schema !== INTEGRATION_PACKAGE_CACHE_REFERENCE_SCHEMA) {
        throw new Error("reference schema is unsupported");
    }
    const reference = createPackageReference(validateReferenceCoordinate(value.kind, value.version, value.digest));
    if (reference.kind !== expected.kind || reference.version !== expected.version) {
        throw new Error("reference identity does not match its cache coordinate");
    }
    if (!equalBytes(document, canonicalJsonBytes(reference))) {
        throw new Error("reference is not canonical JSON");
    }
    return reference;
}

export function assertBoundedReferenceFile(metadata: Stats): void {
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("reference must be a regular file");
    }
    if (metadata.size <= 0 || metadata.size > MAX_REFERENCE_BYTES) {
        throw new Error(`reference must contain between 1 and ${MAX_REFERENCE_BYTES} bytes`);
    }
}

export function assertStableReferenceEntry(expected: Stats, actual: Stats): void {
    if (
        expected.dev !== actual.dev ||
        expected.ino !== actual.ino ||
        expected.size !== actual.size ||
        expected.mtimeMs !== actual.mtimeMs ||
        expected.ctimeMs !== actual.ctimeMs
    ) {
        throw new Error("reference changed while being read");
    }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
