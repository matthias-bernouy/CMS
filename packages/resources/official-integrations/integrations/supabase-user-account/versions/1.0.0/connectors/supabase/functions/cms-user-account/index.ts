type JsonRecord = Record<string, unknown>;

type UserAccountRow = {
    cms_user_id: string;
    email: string | null;
    phone: string | null;
    display_name: string | null;
    avatar_url: string | null;
    locale: string | null;
    timezone: string | null;
    created_at: string;
    updated_at: string;
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
    "access-control-allow-headers": "authorization, content-type, x-user-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

const accountSchema = "user_account";
const accountSelect = [
    "cms_user_id",
    "email",
    "phone",
    "display_name",
    "avatar_url",
    "locale",
    "timezone",
    "created_at",
    "updated_at",
].join(",");

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health(request));
        if (route === "/account") {
            if (request.method === "GET") return await getAccount(request);
            if (request.method === "POST") return await updateAccount(request);
            return methodNotAllowed("GET, POST, OPTIONS");
        }
        if (route === "/delete-account") return await withMethod(request, "POST", () => deleteAccount(request));

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function health(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    return json({ ok: true });
}

async function getAccount(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const row = await getAccountRow(userId);
    return json(publicAccount(row, userId));
}

async function updateAccount(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const body = await readJsonObject(request);
    const values = accountValues(body);
    const row = await upsertAccountRow(userId, values);
    return json(publicAccount(row, userId));
}

async function deleteAccount(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const response = await rest(
        `accounts?cms_user_id=eq.${encodeURIComponent(userId)}&select=cms_user_id`,
        {
            method: "DELETE",
            headers: { prefer: "return=representation" },
        },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as Array<{ cms_user_id: string }>;
    return json({ deleted: rows.length > 0, userId });
}

async function upsertAccountRow(userId: string, values: JsonRecord): Promise<UserAccountRow> {
    const current = await getAccountRow(userId);
    if (current) {
        if (Object.keys(values).length === 0) return current;

        const response = await rest(
            `accounts?cms_user_id=eq.${encodeURIComponent(userId)}&select=${accountSelect}`,
            {
                method: "PATCH",
                headers: {
                    "content-type": "application/json",
                    prefer: "return=representation",
                },
                body: JSON.stringify(values),
            },
        );
        if (!response.ok) throw await restError(response);
        return firstRow<UserAccountRow>(await response.json());
    }

    const response = await rest(`accounts?select=${accountSelect}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify({ cms_user_id: userId, ...values }),
    });
    if (!response.ok) throw await restError(response);
    return firstRow<UserAccountRow>(await response.json());
}

async function getAccountRow(userId: string): Promise<UserAccountRow | null> {
    const response = await rest(
        `accounts?cms_user_id=eq.${encodeURIComponent(userId)}&select=${accountSelect}&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as UserAccountRow[];
    return rows[0] ?? null;
}

function accountValues(body: JsonRecord): JsonRecord {
    return stripUndefined({
        email: optionalEmail(body, "email"),
        phone: optionalText(body, "phone", 64),
        display_name: optionalText(body, "displayName", 160),
        avatar_url: optionalUrl(body, "avatarUrl"),
        locale: optionalText(body, "locale", 35),
        timezone: optionalText(body, "timezone", 64),
    });
}

function publicAccount(row: UserAccountRow | null, userId: string): JsonRecord {
    if (!row) {
        return {
            exists: false,
            userId,
            email: null,
            phone: null,
            displayName: null,
            avatarUrl: null,
            locale: null,
            timezone: null,
            createdAt: null,
            updatedAt: null,
        };
    }

    return {
        exists: true,
        userId: row.cms_user_id,
        email: row.email,
        phone: row.phone,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        locale: row.locale,
        timezone: row.timezone,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-user-account";
    const index = pathname.indexOf(marker);
    if (index === -1) return pathname || "/";
    return pathname.slice(index + marker.length) || "/";
}

async function withMethod(request: Request, method: string, handler: () => Promise<Response>): Promise<Response> {
    if (request.method !== method) return methodNotAllowed(`${method}, OPTIONS`);
    return handler();
}

function methodNotAllowed(allow: string): Response {
    return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...corsHeaders, allow },
    });
}

function requireCmsRequest(
    request: Request,
    options: { requireUser?: boolean } = {},
): { userId: string } {
    const expectedKeys = acceptedCmsApiKeys();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !expectedKeys.some((expected) => safeEqual(token, expected))) {
        throw new HttpError(401, "invalid CMS API key");
    }

    const requireUser = options.requireUser ?? true;
    const userId = request.headers.get("x-user-id")?.trim() || "";
    if (requireUser && !userId) throw new HttpError(401, "missing x-user-id");
    if (userId.length > 200) throw new HttpError(400, "x-user-id is too long");

    return { userId };
}

function acceptedCmsApiKeys(): string[] {
    const keys = unique([
        Deno.env.get("CMS_USER_ACCOUNT_API_KEY") ?? "",
        ...supabaseSecretKeys(),
    ]);

    if (!keys.length) throw new HttpError(500, "missing CMS_USER_ACCOUNT_API_KEY or Supabase secret key");
    return keys;
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", accountSchema);
    if (init.method && init.method !== "GET") headers.set("content-profile", accountSchema);

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

function optionalText(body: JsonRecord, name: string, maxLength: number): string | null | undefined {
    if (!Object.hasOwn(body, name)) return undefined;
    const value = body[name];
    if (value === null) return null;
    if (typeof value !== "string") throw new HttpError(400, `${name} must be a string`);
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw new HttpError(400, `${name} is too long`);
    return normalized;
}

function optionalEmail(body: JsonRecord, name: string): string | null | undefined {
    const value = optionalText(body, name, 320);
    if (value === undefined || value === null) return value;
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, `${name} is invalid`);
    return email;
}

function optionalUrl(body: JsonRecord, name: string): string | null | undefined {
    const value = optionalText(body, name, 2048);
    if (value === undefined || value === null) return value;

    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new HttpError(400, `${name} is invalid`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new HttpError(400, `${name} must be an http or https URL`);
    }
    return parsed.toString();
}

function serviceRoleKey(): string {
    const [key] = supabaseSecretKeys();
    if (key) return key;
    throw new HttpError(500, "missing Supabase secret key");
}

function supabaseSecretKeys(): string[] {
    const keys: string[] = [];
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        try {
            const parsed = JSON.parse(secretKeys);
            if (isRecord(parsed)) {
                for (const value of Object.values(parsed)) {
                    if (typeof value === "string" && value) keys.push(value);
                }
            }
        } catch {
            throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
        }
    }

    const modernSecretKey = Deno.env.get("SUPABASE_SECRET_KEY");
    if (modernSecretKey) keys.push(modernSecretKey);

    const legacyServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (legacyServiceRoleKey) keys.push(legacyServiceRoleKey);

    return unique(keys);
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

function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
