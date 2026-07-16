import { HttpError } from "./errors.ts";
import type { JsonRecord } from "./types.ts";

export function isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readJsonObject(request: Request): Promise<JsonRecord> {
    let value: unknown;
    try {
        value = await request.json();
    } catch {
        throw new HttpError(400, "invalid JSON body");
    }
    if (!isRecord(value)) throw new HttpError(400, "body must be an object");
    return value;
}

export function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requiredText(value: unknown, name: string): string {
    const result = text(value);
    if (!result) throw new HttpError(400, `${name} is required`);
    return result;
}

export function integer(value: unknown, name: string, required = false): number | undefined {
    if (value === undefined || value === null || value === "") {
        if (required) throw new HttpError(400, `${name} is required`);
        return undefined;
    }
    const result = typeof value === "number"
        ? value
        : typeof value === "string" && /^-?\d+$/.test(value.trim())
            ? Number(value.trim())
            : Number.NaN;
    if (!Number.isSafeInteger(result)) throw new HttpError(400, `${name} must be an integer`);
    return result;
}

export function booleanValue(value: unknown, name: string): boolean | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new HttpError(400, `${name} must be a boolean`);
}

export function camelize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(camelize);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
        camelCase(key),
        opaqueJsonColumns.has(key) ? entry : camelize(entry),
    ]));
}

export function publicMetadata(value: unknown, allowedKeys: Set<string>): JsonRecord {
    if (!isRecord(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key]) => allowedKeys.has(key)));
}

function camelCase(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

const opaqueJsonColumns = new Set([
    "metadata",
    "data",
    "shipping_address",
    "billing_address",
    "product_snapshot",
    "variant_snapshot",
    "offer_snapshot",
    "seller_snapshot",
]);
