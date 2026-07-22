import type { SourceEndpoint } from "cms-sources/interfaces/Source";
import type { DataShape } from "cms-sources/interfaces/DataShape";

export type UpstreamBody = { ok: true; body?: BodyInit; streaming: boolean } | { ok: false; response: Response };

class BodyCoercionError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export async function upstreamBody(endpoint: SourceEndpoint, request: Request): Promise<UpstreamBody> {
    if (endpoint.method === "GET" || endpoint.method === "HEAD" || request.body == null) {
        return { ok: true, streaming: false };
    }

    const shape = endpoint.input?.body;
    if (!shape) {
        return { ok: true, body: request.body, streaming: true };
    }
    if (!isJsonRequest(request)) {
        return { ok: false, response: new Response("JSON body required", { status: 415 }) };
    }

    let value: unknown;
    try {
        value = await request.json();
    } catch {
        return { ok: false, response: new Response("invalid JSON body", { status: 400 }) };
    }

    try {
        return { ok: true, body: JSON.stringify(coerceBodyValue(value, shape, "body")), streaming: false };
    } catch (error) {
        if (error instanceof BodyCoercionError) {
            return { ok: false, response: new Response(error.message, { status: 400 }) };
        }
        throw error;
    }
}

function isJsonRequest(request: Request): boolean {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    return contentType.includes("application/json") || contentType.includes("+json");
}

function coerceBodyValue(value: unknown, shape: DataShape, path: string): unknown {
    if (value === null && shape.nullable === true) {
        return null;
    }
    if (shape.type === "boolean") {
        return coerceBoolean(value, path);
    }
    if (shape.type === "number") {
        return coerceNumber(value, path);
    }
    if (shape.type === "object") {
        return coerceObject(value, shape, path);
    }
    if (shape.type === "array") {
        return coerceArray(value, shape, path);
    }
    return value;
}

function coerceObject(value: unknown, shape: DataShape, path: string): unknown {
    if (!isRecord(value) || !shape.properties) {
        return value;
    }
    for (const key of Object.keys(value)) {
        if (!Object.hasOwn(shape.properties, key)) {
            throw new BodyCoercionError(`${path}.${key} is not allowed`);
        }
    }

    return Object.fromEntries(
        Object.entries(shape.properties)
            .filter(([key]) => Object.hasOwn(value, key))
            .map(([key, child]) => [key, coerceBodyValue(value[key], child, `${path}.${key}`)]),
    );
}

function coerceArray(value: unknown, shape: DataShape, path: string): unknown {
    if (!Array.isArray(value) || !shape.items) {
        return value;
    }
    return value.map((item, index) => coerceBodyValue(item, shape.items!, `${path}.${index}`));
}

function coerceBoolean(value: unknown, path: string): boolean {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "on", "yes"].includes(normalized)) {
            return true;
        }
        if (["false", "0", "off", "no"].includes(normalized)) {
            return false;
        }
    }
    if (value === 1) {
        return true;
    }
    if (value === 0) {
        return false;
    }
    throw new BodyCoercionError(`${path} must be a boolean`);
}

function coerceNumber(value: unknown, path: string): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    throw new BodyCoercionError(`${path} must be a number`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
