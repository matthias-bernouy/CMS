import { ReleaseValidationError, type ReleaseValidationCode } from "./errors";

export type UnknownRecord = Record<string, unknown>;

export function expectRecord(value: unknown, path: string, code: ReleaseValidationCode): UnknownRecord {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new ReleaseValidationError(code, "must be an object", path);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new ReleaseValidationError(code, "must be a plain object", path);
    }
    return value as UnknownRecord;
}

export function expectArray(value: unknown, path: string, code: ReleaseValidationCode): unknown[] {
    if (!Array.isArray(value)) {
        throw new ReleaseValidationError(code, "must be an array", path);
    }
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
        throw new ReleaseValidationError(code, "must not be sparse or have extra properties", path);
    }
    return value;
}

export function expectString(value: unknown, path: string, code: ReleaseValidationCode, maxLength: number): string {
    if (typeof value !== "string") {
        throw new ReleaseValidationError(code, "must be a string", path);
    }
    if (value.length === 0) {
        throw new ReleaseValidationError(code, "must not be empty", path);
    }
    if (value.length > maxLength) {
        throw new ReleaseValidationError(code, `must not exceed ${maxLength} characters`, path);
    }
    return value;
}

export function optionalString(
    value: unknown,
    path: string,
    code: ReleaseValidationCode,
    maxLength: number,
): string | undefined {
    return value === undefined ? undefined : expectString(value, path, code, maxLength);
}

export function expectBoolean(value: unknown, path: string, code: ReleaseValidationCode): boolean {
    if (typeof value !== "boolean") {
        throw new ReleaseValidationError(code, "must be a boolean", path);
    }
    return value;
}

export function expectSafeInteger(value: unknown, path: string, code: ReleaseValidationCode): number {
    if (!Number.isSafeInteger(value)) {
        throw new ReleaseValidationError(code, "must be a safe integer", path);
    }
    return value as number;
}

export function rejectUnknownKeys(
    value: UnknownRecord,
    allowed: readonly string[],
    path: string,
    code: ReleaseValidationCode,
): void {
    const allowedKeys = new Set(allowed);
    for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
            throw new ReleaseValidationError(code, `unknown property ${JSON.stringify(key)}`, `${path}.${key}`);
        }
    }
}

export function deepFreeze<T>(value: T): Readonly<T> {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
        return value;
    }
    for (const child of Object.values(value)) {
        deepFreeze(child);
    }
    return Object.freeze(value);
}
