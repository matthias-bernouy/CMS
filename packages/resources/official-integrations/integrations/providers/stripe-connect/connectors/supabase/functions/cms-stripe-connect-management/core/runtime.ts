export type JsonRecord = Record<string, unknown>;

export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-cms-user-id, x-cms-user-role",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function isRecord(value: unknown): value is JsonRecord {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function readJsonObject(request: Request): Promise<JsonRecord> {
    try {
        const value: unknown = await request.json();
        if (isRecord(value)) {
            return value;
        }
    } catch {
        throw new HttpError(400, "invalid JSON body");
    }
    throw new HttpError(400, "body must be an object");
}

export function assertAllowedKeys(body: JsonRecord, allowed: readonly string[]): void {
    const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
    if (unexpected) {
        throw new HttpError(400, `${unexpected} is not allowed`);
    }
}

export function requireCmsRequest(request: Request, requireUser = true): { userId: string } {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token || !safeEqual(token, requiredEnv("CMS_STRIPE_CONNECT_API_KEY"))) {
        throw new HttpError(401, "invalid CMS API key");
    }
    const userId = request.headers.get("x-cms-user-id")?.trim() ?? "";
    if (requireUser && !userId) {
        throw new HttpError(401, "missing x-cms-user-id");
    }
    if (userId.length > 200) {
        throw new HttpError(400, "x-cms-user-id is too long");
    }
    return { userId };
}

export function requireDashboardAdmin(request: Request): { userId: string } {
    const identity = requireCmsRequest(request);
    if (request.headers.get("x-cms-user-role")?.trim() !== "admin") {
        throw new HttpError(403, "the CMS admin role is required");
    }
    return identity;
}

export async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", "stripe_connect");
    if (init.method && init.method !== "GET") {
        headers.set("content-profile", "stripe_connect");
    }
    return fetch(`${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`, { ...init, headers });
}

export async function restError(response: Response): Promise<HttpError> {
    const data: unknown = await response.json().catch(() => null);
    const message =
        isRecord(data) && typeof data.message === "string" ? data.message : `Supabase failed (${response.status})`;
    for (const [prefix, status] of [
        ["validation:", 400],
        ["not_found:", 404],
        ["conflict:", 409],
        ["forbidden:", 403],
    ] as const) {
        if (message.startsWith(prefix)) {
            return new HttpError(status, message.slice(prefix.length).trim());
        }
    }
    return new HttpError(502, message);
}

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
}

export function optionsResponse(): Response {
    return new Response("ok", { headers: corsHeaders });
}

export async function withMethod(
    request: Request,
    method: string,
    handler: () => Promise<Response>,
): Promise<Response> {
    if (request.method !== method) {
        return new Response("Method Not Allowed", {
            status: 405,
            headers: { ...corsHeaders, allow: `${method}, OPTIONS` },
        });
    }
    return handler();
}

export function handleError(error: unknown): Response {
    if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
    }
    console.error(error);
    return json({ error: "internal error" }, 500);
}

export async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function serviceRoleKey(): string {
    const encoded = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (encoded) {
        try {
            const parsed: unknown = JSON.parse(encoded);
            if (isRecord(parsed)) {
                const key = Object.values(parsed).find(
                    (value): value is string => typeof value === "string" && Boolean(value),
                );
                if (key) {
                    return key;
                }
            }
        } catch {
            throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
        }
    }
    return (
        Deno.env.get("SUPABASE_SECRET_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
        requiredEnv("SUPABASE_SECRET_KEY")
    );
}

function requiredEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new HttpError(500, `missing ${name}`);
    }
    return value;
}

function safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let result = 0;
    for (let index = 0; index < left.length; index += 1) {
        result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return result === 0;
}
