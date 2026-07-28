import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";

export type JsonObject = Record<string, unknown>;

export class RepositoryManagementContractError extends Error {
    constructor() {
        super("Repository management contract failed");
        this.name = "RepositoryManagementContractError";
    }
}

export function exactObject(value: unknown, required: readonly string[], optional: readonly string[] = []): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RepositoryManagementContractError();
    }
    const object = value as JsonObject;
    const keys = Object.keys(object);
    if (
        !required.every((key) => keys.includes(key)) ||
        !keys.every((key) => required.includes(key) || optional.includes(key))
    ) {
        throw new RepositoryManagementContractError();
    }
    return object;
}

export function canonicalText(value: unknown, maxLength = 4_096): string {
    if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value.trim() !== value) {
        throw new RepositoryManagementContractError();
    }
    return value;
}

export function packageKind(value: unknown): string {
    try {
        return assertIntegrationPackageKind(value);
    } catch {
        throw new RepositoryManagementContractError();
    }
}

export function packageVersion(value: unknown): string {
    try {
        return assertIntegrationPackageVersion(value);
    } catch {
        throw new RepositoryManagementContractError();
    }
}

export function digest(value: unknown): string {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
        throw new RepositoryManagementContractError();
    }
    return value;
}

export function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new RepositoryManagementContractError();
    }
    return value;
}

export function nonNegativeInteger(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new RepositoryManagementContractError();
    }
    return value as number;
}

export function positiveInteger(value: unknown): number {
    const result = nonNegativeInteger(value);
    if (result === 0) {
        throw new RepositoryManagementContractError();
    }
    return result;
}

export function enumValue<const T extends string>(value: unknown, values: readonly T[]): T {
    if (typeof value !== "string" || !values.includes(value as T)) {
        throw new RepositoryManagementContractError();
    }
    return value as T;
}

export function array(value: unknown, maxLength = 4_096): readonly unknown[] {
    if (!Array.isArray(value) || value.length > maxLength) {
        throw new RepositoryManagementContractError();
    }
    return value;
}

export function uniqueTextArray(value: unknown, maxLength = 4_096): readonly string[] {
    const entries = array(value, maxLength).map((entry) => canonicalText(entry, 512));
    if (new Set(entries).size !== entries.length) {
        throw new RepositoryManagementContractError();
    }
    return entries;
}

export function isoTimestamp(value: unknown): string {
    const timestamp = canonicalText(value, 64);
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== timestamp) {
        throw new RepositoryManagementContractError();
    }
    return timestamp;
}

export function assertEqual(actual: unknown, expected: unknown): void {
    if (actual !== expected) {
        throw new RepositoryManagementContractError();
    }
}
