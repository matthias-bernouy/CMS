import { HttpError } from "./errors.ts";
import type { JsonRecord } from "./types.ts";

export function isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readJsonObject(request: Request): Promise<JsonRecord> {
    try {
        const value: unknown = await request.json();
        if (isRecord(value)) {
            return value;
        }
    } catch {
        // The normalized error below intentionally hides parser details.
    }
    throw new HttpError(400, "body must be a JSON object");
}

export function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requiredText(value: unknown, name: string): string {
    const result = text(value);
    if (!result) {
        throw new HttpError(400, `${name} is required`);
    }
    return result;
}

export function integer(value: unknown, name: string, required = false): number | undefined {
    if (value === undefined || value === null || value === "") {
        if (required) {
            throw new HttpError(400, `${name} is required`);
        }
        return undefined;
    }
    const result =
        typeof value === "number"
            ? value
            : typeof value === "string" && /^\d+$/.test(value.trim())
              ? Number(value.trim())
              : Number.NaN;
    if (!Number.isSafeInteger(result) || result < 1) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return result;
}

export function nonNegativeInteger(value: unknown, name: string): number | undefined {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    const result =
        typeof value === "number"
            ? value
            : typeof value === "string" && /^\d+$/.test(value.trim())
              ? Number(value.trim())
              : Number.NaN;
    if (!Number.isSafeInteger(result) || result < 0) {
        throw new HttpError(400, `${name} must be a non-negative integer`);
    }
    return result;
}

export function enumValue<T extends string>(
    value: unknown,
    name: string,
    allowed: readonly T[],
    required = false,
): T | undefined {
    const result = text(value);
    if (!result && !required) {
        return undefined;
    }
    if (!result || !allowed.includes(result as T)) {
        throw new HttpError(400, `${name} must be one of: ${allowed.join(", ")}`);
    }
    return result as T;
}

export function objectValue(value: unknown, name: string): JsonRecord {
    if (!isRecord(value)) {
        throw new HttpError(400, `${name} must be an object`);
    }
    return value;
}

export function arrayValue(value: unknown, name: string, max = 500): unknown[] {
    if (!Array.isArray(value) || value.length > max) {
        throw new HttpError(400, `${name} must be an array with at most ${max} entries`);
    }
    return value;
}

export function queryInteger(request: Request, name: string, required = false): number | undefined {
    return integer(new URL(request.url).searchParams.get(name), name, required);
}

export function camelize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(camelize);
    }
    if (!isRecord(value)) {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
            key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
            opaqueJsonColumns.has(key) ? entry : camelize(entry),
        ]),
    );
}

const opaqueJsonColumns = new Set(["metadata", "payload", "proposal", "selections", "custom_items"]);
