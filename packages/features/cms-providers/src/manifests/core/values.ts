import { ProviderManifestValidationError } from "./errors";

export type UnknownRecord = Record<string, unknown>;

export function expectRecord(value: unknown, path: string): UnknownRecord {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be an object", path);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be a plain object", path);
    }
    return value as UnknownRecord;
}

export function expectArray(value: unknown, path: string, maximum: number): unknown[] {
    if (!Array.isArray(value)) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be an array", path);
    }
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "must not be sparse or have extra properties",
            path,
        );
    }
    if (value.length > maximum) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            `must not contain more than ${maximum} entries`,
            path,
        );
    }
    return value;
}

export function expectString(value: unknown, path: string, maximum: number): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be a non-empty string", path);
    }
    if (value.length > maximum) {
        throw new ProviderManifestValidationError("invalid_manifest", `must not exceed ${maximum} characters`, path);
    }
    return value;
}

export function expectBoolean(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") {
        throw new ProviderManifestValidationError("invalid_manifest", "must be a boolean", path);
    }
    return value;
}

export function rejectUnknownKeys(value: UnknownRecord, allowed: readonly string[], path: string): void {
    const allowedKeys = new Set(allowed);
    for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
            throw new ProviderManifestValidationError(
                "invalid_manifest",
                `unknown property ${JSON.stringify(key)}`,
                `${path}.${key}`,
            );
        }
    }
}

export function unique(values: readonly string[], path: string): void {
    if (new Set(values).size !== values.length) {
        throw new ProviderManifestValidationError("invalid_manifest", "must not contain duplicates", path);
    }
}

export function compareOrdinal(left: string, right: string): number {
    return left === right ? 0 : left < right ? -1 : 1;
}
