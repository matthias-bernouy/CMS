import type { JsonRecord } from "./types";

export function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): JsonRecord {
    return isRecord(value) ? value : {};
}

export function filterValue(value: string | null): { operator: string; value: string } | null {
    if (!value) {
        return null;
    }
    const [operator, ...rest] = value.split(".");
    return { operator: operator ?? "", value: rest.join(".") };
}

export function same(a: unknown, b: unknown): boolean {
    return String(a) === String(b);
}
