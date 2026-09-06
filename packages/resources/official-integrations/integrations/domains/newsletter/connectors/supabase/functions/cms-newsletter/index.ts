type JsonRecord = Record<string, unknown>;

type NewsletterSubscriptionRow = {
    email: string;
    subscribed: boolean;
    created_at?: string;
    updated_at?: string;
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
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
};

const newsletterSchema = "newsletter";
const subscriptionSelect = "email,subscribed,created_at,updated_at";

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") {
            return optionsResponse();
        }

        const route = routePath(request);
        if (route === "/health") {
            return await withMethod(request, "GET", () => health(request));
        }
        if (route === "/subscriptions") {
            return await withMethod(request, "GET", () => listSubscriptions(request));
        }
        if (route === "/subscriptions/export") {
            return await withMethod(request, "GET", () => exportSubscriptions(request));
        }
        if (route === "/subscription") {
            return await subscriptionRoute(request);
        }

        if (route === "/set-subscription") {
            return await withMethod(request, "POST", () => setSubscription(request));
        }
        if (route === "/subscription-status") {
            return await withMethod(request, "GET", () => getSubscriptionStatus(request));
        }

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function subscriptionRoute(request: Request): Promise<Response> {
    if (request.method === "GET") {
        return getSubscriptionStatus(request);
    }
    if (request.method === "POST") {
        return setSubscription(request);
    }
    if (request.method === "DELETE") {
        return deleteSubscription(request);
    }
    return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...corsHeaders, allow: "GET, POST, DELETE, OPTIONS" },
    });
}

async function health(request: Request): Promise<Response> {
    requireCmsRequest(request);
    let healthy = false;
    try {
        healthy = (await rest("subscriptions?select=email&limit=1", { method: "GET" })).ok;
    } catch {
        /* Return a structured storage failure. */
    }
    return json({
        schemaVersion: 1,
        configuration: { savedRevision: null, appliedRevision: null },
        status: healthy ? "ready" : "blocked",
        checkedAt: new Date().toISOString(),
        checks: [
            {
                id: "storage",
                status: healthy ? "ok" : "error",
                message: healthy ? "Source storage is reachable." : "Source storage is unavailable.",
            },
        ],
    });
}

async function listSubscriptions(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const url = new URL(request.url);
    const q = optionalSearch(url.searchParams.get("q"));
    const subscribed = optionalBoolean(url.searchParams.get("subscribed"), "subscribed");
    const limit = boundedLimit(url.searchParams.get("limit"));
    const offset = boundedOffset(url.searchParams.get("offset"));

    const query = new URLSearchParams();
    query.set("select", subscriptionSelect);
    query.set("order", "updated_at.desc");
    query.set("limit", String(limit));
    query.set("offset", String(offset));
    if (q) {
        query.set("email", `ilike.*${q}*`);
    }
    if (subscribed !== null) {
        query.set("subscribed", `eq.${subscribed}`);
    }

    const response = await rest(`subscriptions?${query.toString()}`, {
        method: "GET",
        headers: { prefer: "count=exact" },
    });
    if (!response.ok) {
        throw await restError(response);
    }

    const rows = (await response.json()) as NewsletterSubscriptionRow[];
    return json({
        subscriptions: rows.map(publicSubscription),
        total: countFromContentRange(response.headers.get("content-range")) ?? rows.length,
    });
}

async function exportSubscriptions(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const url = new URL(request.url);
    const q = optionalSearch(url.searchParams.get("q"));
    const subscribed = optionalBoolean(url.searchParams.get("subscribed"), "subscribed");

    const query = new URLSearchParams();
    query.set("select", subscriptionSelect);
    query.set("order", "updated_at.desc");
    query.set("limit", "10000");
    if (q) {
        query.set("email", `ilike.*${q}*`);
    }
    if (subscribed !== null) {
        query.set("subscribed", `eq.${subscribed}`);
    }

    const response = await rest(`subscriptions?${query.toString()}`, { method: "GET" });
    if (!response.ok) {
        throw await restError(response);
    }

    const rows = (await response.json()) as NewsletterSubscriptionRow[];
    return csv(subscriptionsCsv(rows), "newsletter-subscriptions.csv");
}

async function setSubscription(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const body = await readJsonObject(request);
    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email") ?? stringField(body, "email", false) ?? "");
    const subscribed = booleanField(body, "subscribed");

    const row = await upsertSubscription({ email, subscribed });
    return json(publicSubscription(row));
}

async function getSubscriptionStatus(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email") ?? "");
    const row = await getSubscription(email);

    if (!row) {
        return json({
            exists: false,
            email,
            subscribed: false,
        });
    }

    return json(publicSubscription(row));
}

async function deleteSubscription(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email") ?? "");
    const row = await deleteSubscriptionRow(email);

    return json({
        deleted: !!row,
        email,
    });
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-newsletter";
    const index = pathname.indexOf(marker);
    if (index === -1) {
        return pathname || "/";
    }
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
    if (!token || !safeEqual(token, expected)) {
        throw new HttpError(401, "invalid CMS API key");
    }
}

async function upsertSubscription(values: JsonRecord): Promise<NewsletterSubscriptionRow> {
    const query = new URLSearchParams();
    query.set("on_conflict", "email");
    query.set("select", subscriptionSelect);

    const response = await rest(`subscriptions?${query.toString()}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    return firstRow<NewsletterSubscriptionRow>(await response.json());
}

async function getSubscription(email: string): Promise<NewsletterSubscriptionRow | null> {
    const query = new URLSearchParams();
    query.set("select", subscriptionSelect);
    query.set("email", `eq.${email}`);
    query.set("limit", "1");

    const response = await rest(`subscriptions?${query.toString()}`, { method: "GET" });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as NewsletterSubscriptionRow[];
    return rows[0] ?? null;
}

async function deleteSubscriptionRow(email: string): Promise<NewsletterSubscriptionRow | null> {
    const query = new URLSearchParams();
    query.set("select", "email");
    query.set("email", `eq.${email}`);

    const response = await rest(`subscriptions?${query.toString()}`, {
        method: "DELETE",
        headers: { prefer: "return=representation" },
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as NewsletterSubscriptionRow[];
    return rows[0] ?? null;
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", newsletterSchema);
    if (init.method && init.method !== "GET") {
        headers.set("content-profile", newsletterSchema);
    }

    return fetch(`${base}/rest/v1/${path}`, { ...init, headers });
}

async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null);
    const message =
        isRecord(data) && typeof data.message === "string"
            ? data.message
            : `Supabase request failed (${response.status})`;
    return new HttpError(502, message);
}

function firstRow<T>(value: unknown): T {
    if (!Array.isArray(value) || !value[0]) {
        throw new HttpError(502, "Supabase returned no rows");
    }
    return value[0] as T;
}

function publicSubscription(row: NewsletterSubscriptionRow): JsonRecord {
    return {
        exists: true,
        email: row.email,
        subscribed: row.subscribed,
        ...(row.created_at ? { createdAt: row.created_at } : {}),
        ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
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

function csv(data: string, fileName: string): Response {
    return new Response(data, {
        status: 200,
        headers: {
            ...corsHeaders,
            "cache-control": "no-store",
            "content-disposition": `attachment; filename="${fileName}"`,
            "content-type": "text/csv; charset=utf-8",
        },
    });
}

function subscriptionsCsv(rows: NewsletterSubscriptionRow[]): string {
    const header = ["email", "subscribed", "createdAt", "updatedAt"];
    const lines = rows.map((row) =>
        [row.email, row.subscribed ? "true" : "false", row.created_at ?? "", row.updated_at ?? ""]
            .map(csvCell)
            .join(","),
    );
    return [header.join(","), ...lines].join("\n") + "\n";
}

function csvCell(value: string): string {
    if (!/[",\r\n]/.test(value)) {
        return value;
    }
    return `"${value.replace(/"/g, '""')}"`;
}

function handleError(error: unknown): Response {
    if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
    }
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
    if (!isRecord(value)) {
        throw new HttpError(400, "body must be an object");
    }
    return value;
}

function stringField(body: JsonRecord, name: string, required = true): string | undefined {
    const value = body[name];
    if (value === undefined || value === null || value === "") {
        if (required) {
            throw new HttpError(400, `${name} is required`);
        }
        return undefined;
    }
    if (typeof value !== "string") {
        throw new HttpError(400, `${name} must be a string`);
    }
    return value;
}

function booleanField(body: JsonRecord, name: string): boolean {
    const value = body[name];
    if (value === "true") {
        return true;
    }
    if (value === "false") {
        return false;
    }
    if (typeof value !== "boolean") {
        throw new HttpError(400, `${name} must be a boolean`);
    }
    return value;
}

function normalizeEmail(value: string): string {
    const email = value.trim().toLowerCase();
    if (!email) {
        throw new HttpError(400, "email is required");
    }
    if (email.length > 320) {
        throw new HttpError(400, "email is too long");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, "email is invalid");
    }
    return email;
}

function optionalSearch(value: string | null): string | null {
    const search = (value ?? "").trim().toLowerCase();
    if (!search) {
        return null;
    }
    return search.slice(0, 120).replace(/[*,()%_]/g, "");
}

function optionalBoolean(value: string | null, name: string): boolean | null {
    const text = (value ?? "").trim().toLowerCase();
    if (!text) {
        return null;
    }
    if (text === "true") {
        return true;
    }
    if (text === "false") {
        return false;
    }
    throw new HttpError(400, `${name} must be true or false`);
}

function boundedLimit(value: string | null): number {
    if (!value) {
        return 100;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new HttpError(400, "limit must be a positive integer");
    }
    return Math.min(parsed, 200);
}

function boundedOffset(value: string | null): number {
    if (!value) {
        return 0;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new HttpError(400, "offset must be a non-negative integer");
    }
    return Math.min(parsed, 1000000);
}

function countFromContentRange(value: string | null): number | null {
    if (!value) {
        return null;
    }
    const total = value.split("/")[1];
    if (!total || total === "*") {
        return null;
    }
    const parsed = Number(total);
    return Number.isFinite(parsed) ? parsed : null;
}

function serviceRoleKey(): string {
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        try {
            const parsed = JSON.parse(secretKeys);
            if (isRecord(parsed)) {
                if (typeof parsed.default === "string" && parsed.default) {
                    return parsed.default;
                }
                const firstKey = Object.values(parsed).find((value) => typeof value === "string" && value);
                if (typeof firstKey === "string") {
                    return firstKey;
                }
            }
        } catch {
            throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
        }
    }

    return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
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
