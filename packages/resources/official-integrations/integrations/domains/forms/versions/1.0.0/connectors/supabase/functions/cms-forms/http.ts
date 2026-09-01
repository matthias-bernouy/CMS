export class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly fields?: Record<string, string>,
    ) {
        super(message);
    }
}

export const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-cms-user-id, x-cms-user-role",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: {
            ...corsHeaders,
            "cache-control": "private, no-store",
            "content-type": "application/json; charset=utf-8",
        },
    });
}

export function optionsResponse(): Response {
    return new Response("ok", { headers: corsHeaders });
}

export function methodNotAllowed(...methods: string[]): Response {
    return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...corsHeaders, allow: [...methods, "OPTIONS"].join(", ") },
    });
}

export function handleError(error: unknown): Response {
    if (error instanceof HttpError) {
        return json({ error: error.message, ...(error.fields ? { fields: error.fields } : {}) }, error.status);
    }
    console.error(error);
    return json({ error: "internal error" }, 500);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestBody(request: Request): Promise<Record<string, unknown>> {
    const value = await request.json().catch(() => null);
    if (!isRecord(value)) {
        throw new HttpError(400, "request body must be an object");
    }
    return value;
}

export function queryText(url: URL, name: string, required = false): string | null {
    const value = url.searchParams.get(name)?.trim() || null;
    if (required && !value) {
        throw new HttpError(422, `${name} is required`);
    }
    return value;
}

export function boundedInteger(
    value: unknown,
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
): number {
    const parsed = value === null || value === undefined || value === "" ? fallback : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new HttpError(422, `${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return parsed;
}
