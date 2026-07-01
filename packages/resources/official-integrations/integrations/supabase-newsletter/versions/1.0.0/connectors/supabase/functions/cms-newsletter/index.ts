type JsonRecord = Record<string, unknown>;

type NewsletterSubscription = {
    email: string;
    subscribed: boolean;
};

class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

const newsletterSchema = "newsletter";

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health(request));
        if (route === "/set-subscription") return await withMethod(request, "POST", () => setSubscription(request));
        if (route === "/subscription-status") return await withMethod(request, "GET", () => subscriptionStatus(request));

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function health(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ ok: true });
}

async function setSubscription(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const body = await readJsonObject(request);
    const email = normalizeEmail(stringField(body, "email")!);
    const subscribed = booleanField(body, "subscribed");

    const row = await upsertSubscription({ email, subscribed });
    return json(publicSubscription(row));
}

async function subscriptionStatus(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email") ?? "");
    const row = await getSubscription(email);

    if (!row) {
        return json({
            email,
            subscribed: false,
        });
    }

    return json(publicSubscription(row));
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-newsletter";
    const index = pathname.indexOf(marker);
    if (index === -1) return pathname || "/";
    return pathname.slice(index + marker.length) || "/";
}

async function withMethod(request: Request, method: string, handler: () => Promise<Response>): Promise<Response> {
    if (request.method !== method) {
        return new Response("Method Not Allowed", {
            status: 405,
            headers: { ...corsHeaders, allow: `${method}, OPTIONS` },
        });
    }
    return handler();
}

function requireCmsRequest(request: Request): void {
    const expected = requiredEnv("CMS_NEWSLETTER_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, expected)) throw new HttpError(401, "invalid CMS API key");
}

async function upsertSubscription(values: JsonRecord): Promise<NewsletterSubscription> {
    const response = await rest("subscriptions?on_conflict=email&select=email,subscribed", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow<NewsletterSubscription>(await response.json());
}

async function getSubscription(email: string): Promise<NewsletterSubscription | null> {
    const response = await rest(
        `subscriptions?email=eq.${encodeURIComponent(email)}&select=email,subscribed&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as NewsletterSubscription[];
    return rows[0] ?? null;
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", newsletterSchema);
    if (init.method && init.method !== "GET") headers.set("content-profile", newsletterSchema);

    return fetch(`${base}/rest/v1/${path}`, { ...init, headers });
}

async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null);
    const message = isRecord(data) && typeof data.message === "string"
        ? data.message
        : `Supabase request failed (${response.status})`;
    return new HttpError(502, message);
}

function firstRow<T>(value: unknown): T {
    if (!Array.isArray(value) || !value[0]) throw new HttpError(502, "Supabase returned no rows");
    return value[0] as T;
}

function publicSubscription(row: NewsletterSubscription): JsonRecord {
    return {
        email: row.email,
        subscribed: row.subscribed,
    };
}

function optionsResponse(): Response {
    return new Response("ok", { headers: corsHeaders });
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            "content-type": "application/json; charset=utf-8",
        },
    });
}

function handleError(error: unknown): Response {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "internal error" }, 500);
}

async function readJsonObject(request: Request): Promise<JsonRecord> {
    let value: unknown;
    try {
        value = await request.json();
    } catch {
        throw new HttpError(400, "invalid JSON body");
    }
    if (!isRecord(value)) throw new HttpError(400, "body must be an object");
    return value;
}

function stringField(body: JsonRecord, name: string, required = true): string | undefined {
    const value = body[name];
    if (value === undefined || value === null || value === "") {
        if (required) throw new HttpError(400, `${name} is required`);
        return undefined;
    }
    if (typeof value !== "string") throw new HttpError(400, `${name} must be a string`);
    return value;
}

function booleanField(body: JsonRecord, name: string): boolean {
    const value = body[name];
    if (typeof value !== "boolean") throw new HttpError(400, `${name} must be a boolean`);
    return value;
}

function normalizeEmail(value: string): string {
    const email = value.trim().toLowerCase();
    if (!email) throw new HttpError(400, "email is required");
    if (email.length > 320) throw new HttpError(400, "email is too long");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "email is invalid");
    return email;
}

function serviceRoleKey(): string {
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        try {
            const parsed = JSON.parse(secretKeys);
            if (isRecord(parsed)) {
                if (typeof parsed.default === "string" && parsed.default) return parsed.default;
                const firstKey = Object.values(parsed).find(value => typeof value === "string" && value);
                if (typeof firstKey === "string") return firstKey;
            }
        } catch {
            throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
        }
    }

    return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function requiredEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) throw new HttpError(500, `missing ${name}`);
    return value;
}

function safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let result = 0;
    for (let i = 0; i < left.length; i++) {
        result |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return result === 0;
}

function stripUndefined(value: JsonRecord): JsonRecord {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
