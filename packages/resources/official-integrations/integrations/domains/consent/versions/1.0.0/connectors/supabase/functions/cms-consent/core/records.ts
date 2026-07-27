import { HttpError } from "./errors.ts";
import type { JsonRecord } from "./types.ts";

const contextPattern = /^[a-z][a-z0-9_.-]{0,79}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const versionPattern = /^[a-f0-9]{64}$/;

export async function readJsonObject(request: Request, maximumBytes = 10_000_000): Promise<JsonRecord> {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maximumBytes) {
        throw new HttpError(413, "request body is too large");
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > maximumBytes) {
        throw new HttpError(413, "request body is too large");
    }
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        throw new HttpError(400, "invalid JSON body");
    }
    if (!isRecord(value)) {
        throw new HttpError(400, "body must be an object");
    }
    return value;
}

export function requiredText(body: JsonRecord, name: string, maximum = 4096): string {
    const value = body[name];
    if (typeof value !== "string" || !value.trim() || value.length > maximum) {
        throw new HttpError(400, `${name} is required`);
    }
    return value.trim();
}

export function optionalText(value: string | null, maximum = 512): string | null {
    const result = (value ?? "").trim();
    if (!result) {
        return null;
    }
    if (result.length > maximum) {
        throw new HttpError(400, "query value is too long");
    }
    return result;
}

export function contextKey(value: unknown): string {
    if (typeof value !== "string" || !contextPattern.test(value)) {
        throw new HttpError(400, "contextKey is invalid");
    }
    return value;
}

export function attemptId(value: unknown): string {
    if (typeof value !== "string" || !uuidPattern.test(value)) {
        throw new HttpError(400, "attemptId must be a UUID");
    }
    return value;
}

export function acceptedVersionIds(value: unknown): string[] {
    const entries = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    if (!entries.length || entries.length > 8 || entries.some((entry) => typeof entry !== "string")) {
        throw new HttpError(400, "acceptedVersionIds must contain one to 8 version ids");
    }
    const result = entries.map(String);
    if (new Set(result).size !== result.length || result.some((entry) => !versionPattern.test(entry))) {
        throw new HttpError(400, "acceptedVersionIds contains an invalid or duplicate version id");
    }
    return result;
}

export function boundedLimit(value: string | null): number {
    if (!value) {
        return 50;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new HttpError(400, "limit must be a positive integer");
    }
    return Math.min(parsed, 100);
}

export function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
