import { HttpError } from "../http/errors.ts";
import type { JsonRecord } from "./types.ts";

export function stripUndefined(value: JsonRecord): JsonRecord {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

export function objectAt(value: JsonRecord, key: string): JsonRecord {
    const nested = value[key];
    return isRecord(nested) ? nested : {};
}

export function stringAt(value: JsonRecord, key: string): string {
    const nested = value[key];
    return typeof nested === "string" ? nested : "";
}

export function stripeObjectId(value: unknown): string {
    if (typeof value === "string") return value;
    return isRecord(value) ? stringAt(value, "id") : "";
}

export function numberAt(value: JsonRecord, key: string): number | undefined {
    const nested = value[key];
    return typeof nested === "number" ? nested : undefined;
}

export function unixTimestampAt(value: JsonRecord, key: string): number | undefined {
    const nested = value[key];
    if (typeof nested === "number") return nested;
    if (typeof nested !== "string") return undefined;
    const milliseconds = Date.parse(nested);
    return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : undefined;
}

export function arrayAt(value: JsonRecord, key: string): unknown[] {
    const nested = value[key];
    return Array.isArray(nested) ? nested : [];
}

export function stringArrayAt(value: JsonRecord, key: string): string[] {
    return arrayAt(value, key).filter((entry): entry is string => typeof entry === "string");
}

export function recordArrayAt(value: JsonRecord, key: string): JsonRecord[] {
    return arrayAt(value, key).filter(isRecord);
}

export function requiredRecordString(value: JsonRecord, key: string, maxLength: number): string {
    const child = value[key];
    if (typeof child !== "string" || !child.trim() || child.length > maxLength) {
        throw new HttpError(400, `Stripe event ${key} is invalid`);
    }
    return child;
}

export function requiredRecordInteger(value: JsonRecord, key: string): number {
    const child = value[key];
    if (!Number.isSafeInteger(child)) throw new HttpError(400, `Stripe event ${key} is invalid`);
    return child as number;
}

export function jsonEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "unknown provider error";
}

export function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
