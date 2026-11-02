import { documentationPath } from "@bernouy/cms-repository/contracts/documentation";
import { isReleaseDigest } from "@bernouy/cms-repository/contracts";
import type { DocumentationReference } from "../interfaces/Documentation";

export class DocumentationError extends Error {
    constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "REVISION_CONFLICT" | "CORE_UNAVAILABLE") {
        super(code);
    }
}
export function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
    if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !keys.includes(key))
    ) {
        throw new DocumentationError("INVALID_INPUT");
    }
    return input as Record<string, unknown>;
}
export function text(value: unknown, max = 128): string {
    if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > max ||
        !value.isWellFormed() ||
        /[\x00-\x1f\x7f]/u.test(value)
    ) {
        throw new DocumentationError("INVALID_INPUT");
    }
    return value;
}
export function reference(input: unknown): DocumentationReference {
    const value = record(input, ["contractId", "releaseDigest", "path"]);
    if (typeof value.releaseDigest !== "string" || !isReleaseDigest(value.releaseDigest)) {
        throw new DocumentationError("INVALID_INPUT");
    }
    let path: string;
    try {
        path = documentationPath(value.path);
    } catch {
        throw new DocumentationError("INVALID_INPUT");
    }
    return { contractId: text(value.contractId), releaseDigest: value.releaseDigest, path };
}
export function integer(value: unknown, fallback: number, min: number, max: number): number {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
        throw new DocumentationError("INVALID_INPUT");
    }
    return value;
}
