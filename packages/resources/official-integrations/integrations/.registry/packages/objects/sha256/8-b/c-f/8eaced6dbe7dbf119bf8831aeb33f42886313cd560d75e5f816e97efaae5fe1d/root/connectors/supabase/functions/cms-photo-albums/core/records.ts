import { HttpError } from "./errors.ts";

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function readJsonObject(request: Request): Promise<JsonRecord> {
    const value = await request.json().catch(() => null);
    if (!isRecord(value)) {
        throw new HttpError(400, "request body must be a JSON object");
    }
    return value;
}

export function requiredId(request: Request, name: string, fallback?: string): number {
    const params = new URL(request.url).searchParams;
    const raw = params.get(name) ?? (fallback ? params.get(fallback) : null);
    const value = typeof raw === "string" && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return value;
}

export function optionalInteger(value: unknown, name: string, fallback: number): number {
    const number = value === undefined || value === null || value === "" ? fallback : Number(value);
    if (!Number.isSafeInteger(number)) {
        throw new HttpError(400, `${name} must be an integer`);
    }
    return number;
}

export function optionalText(value: unknown, name: string): string | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    if (typeof value !== "string") {
        throw new HttpError(400, `${name} must be a string`);
    }
    return value.trim() || null;
}

export function requiredText(value: unknown, name: string): string {
    const text = optionalText(value, name);
    if (!text) {
        throw new HttpError(400, `${name} is required`);
    }
    return text;
}

export function requiredBoolean(value: unknown, name: string): boolean {
    if (typeof value !== "boolean") {
        throw new HttpError(400, `${name} must be a boolean`);
    }
    return value;
}

export function requiredInteger(value: unknown, name: string): number {
    if (value === undefined || value === null || value === "") {
        throw new HttpError(400, `${name} is required`);
    }
    return optionalInteger(value, name, 0);
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
            key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
            camelize(entry),
        ]),
    );
}
