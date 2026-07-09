type JsonRecord = Record<string, unknown>;

type UserAccountRow = {
    cms_user_id: string;
    email: string | null;
    phone: string | null;
    display_name: string | null;
    avatar_url: string | null;
    avatar_file_id: string | null;
    locale: string | null;
    timezone: string | null;
    metadata: JsonRecord;
    created_at: string;
    updated_at: string;
};

type ExtraFieldRow = {
    id: string;
    label: string;
    field_type: "string" | "number" | "boolean";
    required: boolean;
    show_in_dashboard_table: boolean;
    position: number;
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
const avatarBucket = "user-account-avatars";
const maxAvatarBytes = 5 * 1024 * 1024;
const avatarContentTypes = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/gif", ".gif"],
]);
const accountSelect = [
    "cms_user_id",
    "email",
    "phone",
    "display_name",
    "avatar_url",
    "avatar_file_id",
    "locale",
    "timezone",
    "metadata",
    "created_at",
    "updated_at",
].join(",");
const extraFieldSelect = [
    "id",
    "label",
    "field_type",
    "required",
    "show_in_dashboard_table",
    "position",
    "created_at",
    "updated_at",
].join(",");

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health(request));
        if (route === "/account" || route === "/personal-information") {
            if (request.method === "GET") return await getAccount(request);
            if (request.method === "POST") return await updateAccount(request);
            return methodNotAllowed("GET, POST, OPTIONS");
        }
        if (route === "/account/avatar" || route === "/personal-information/avatar") {
            if (request.method === "GET") return await getAccountAvatar(request);
            if (request.method === "POST") return await uploadAccountAvatar(request);
            return methodNotAllowed("GET, POST, OPTIONS");
        }
        if (route === "/accounts" || route === "/personal-information/records") {
            return await withMethod(request, "GET", () => listAccounts(request));
        }
        if (route === "/extra-fields" || route === "/personal-information/extra-fields") {
            if (request.method === "GET") return await listExtraFields(request);
            if (request.method === "POST") return await createExtraField(request);
            return methodNotAllowed("GET, POST, OPTIONS");
        }
        if (route === "/extra-fields/field" || route === "/personal-information/extra-fields/field") {
            return await withMethod(request, "GET", () => getExtraField(request));
        }
        if (route === "/accounts/account" || route === "/personal-information/record") {
            if (request.method === "GET") return await getAccountByUserId(request);
            if (request.method === "POST") return await createAccountByUserId(request);
            if (request.method === "DELETE") return await deleteAccountByUserId(request);
            return methodNotAllowed("GET, POST, DELETE, OPTIONS");
        }
        if (route === "/accounts/account/avatar" || route === "/personal-information/record/avatar") {
            if (request.method === "GET") return await getAccountAvatarByUserId(request);
            if (request.method === "POST") return await uploadAccountAvatarByUserId(request);
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

async function uploadAccountAvatar(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const file = await readUploadFile(request);
    const fileId = await uploadAvatarFile(userId, file);
    return json({ fileId });
}

async function getAccountAvatar(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const fileId = requiredQueryText(request, "fileId", 512);
    return await serveAvatarFile(userId, fileId);
}

async function deleteAccount(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const deleted = await deleteAccountRow(userId);
    return json({ deleted, userId });
}

async function deleteAccountRow(userId: string): Promise<boolean> {
    const response = await rest(
        `accounts?cms_user_id=eq.${encodeURIComponent(userId)}&select=cms_user_id`,
        {
            method: "DELETE",
            headers: { prefer: "return=representation" },
        },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as Array<{ cms_user_id: string }>;
    return rows.length > 0;
}

async function listAccounts(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const params = new URL(request.url).searchParams;
    const limit = queryLimit(params.get("limit"));
    const search = searchPattern(params.get("q"));
    const query = new URLSearchParams({
        select: accountSelect,
        order: "updated_at.desc",
        limit: String(limit),
    });

    if (search) {
        const clauses = [
            `cms_user_id.ilike.${search}`,
            `email.ilike.${search}`,
            `phone.ilike.${search}`,
            `display_name.ilike.${search}`,
        ].join(",");
        query.set("or", `(${clauses})`);
    }

    const response = await rest(`accounts?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as UserAccountRow[];
    return json({
        accounts: rows.map(row => publicAccount(row, row.cms_user_id)),
        total: rows.length,
    });
}

async function listExtraFields(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });

    const response = await rest(`extra_fields?select=${extraFieldSelect}&order=position.asc,id.asc`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ExtraFieldRow[];
    return json({ fields: rows.map(extraField) });
}

async function getExtraField(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });

    const id = requiredQueryText(request, "id", 64);
    if (id === "__new__") {
        return json({ field: { id: "", label: "", type: "string", required: false, showInDashboardTable: false } });
    }

    const response = await rest(
        `extra_fields?id=eq.${encodeURIComponent(id)}&select=${extraFieldSelect}&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ExtraFieldRow[];
    if (!rows[0]) throw new HttpError(404, "field not found");
    return json({ field: extraField(rows[0]) });
}

async function createExtraField(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });

    const body = await readJsonObject(request);
    const label = requiredText(body, "label", 120);
    const id = optionalText(body, "id", 64) ?? fieldIdFromLabel(label);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new HttpError(400, "id is invalid");
    const values = {
        id,
        label,
        field_type: requiredFieldType(body, "type"),
        required: optionalBoolean(body, "required") ?? false,
        show_in_dashboard_table: optionalBoolean(body, "showInDashboardTable") ?? false,
    };
    const response = await rest(`extra_fields?on_conflict=id&select=${extraFieldSelect}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(values),
    });
    if (!response.ok) throw await restError(response);
    return json({ field: extraField(firstRow<ExtraFieldRow>(await response.json())) });
}

async function getAccountByUserId(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const userId = requiredQueryText(request, "userId", 200);
    const row = await getAccountRow(userId);
    return json(publicAccount(row, userId));
}

async function createAccountByUserId(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const userId = requiredQueryText(request, "userId", 200);
    const body = await readJsonObject(request);
    const values = accountValues(body);
    const row = await upsertAccountRow(userId, values);
    return json(publicAccount(row, userId));
}

async function deleteAccountByUserId(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const userId = requiredQueryText(request, "userId", 200);
    const deleted = await deleteAccountRow(userId);
    return json({ deleted, userId });
}

async function uploadAccountAvatarByUserId(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const userId = requiredQueryText(request, "userId", 200);
    const file = await readUploadFile(request);
    const fileId = await uploadAvatarFile(userId, file);
    return json({ fileId });
}

async function getAccountAvatarByUserId(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const userId = requiredQueryText(request, "userId", 200);
    const fileId = requiredQueryText(request, "fileId", 512);
    return await serveAvatarFile(userId, fileId);
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
        avatar_file_id: optionalText(body, "avatarFileId", 512),
        locale: optionalText(body, "locale", 35),
        timezone: optionalText(body, "timezone", 64),
        metadata: optionalMetadata(body, "metadata"),
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
            avatarFileId: null,
            locale: null,
            timezone: null,
            metadata: {},
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
        avatarFileId: row.avatar_file_id,
        locale: row.locale,
        timezone: row.timezone,
        metadata: isRecord(row.metadata) ? row.metadata : {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function extraField(row: ExtraFieldRow): JsonRecord {
    return {
        id: row.id,
        label: row.label,
        type: row.field_type,
        section: "accountFields",
        required: row.required,
        showInDashboardTable: row.show_in_dashboard_table,
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
    const keys = unique([Deno.env.get("CMS_USER_ACCOUNT_API_KEY") ?? ""]);

    if (!keys.length) throw new HttpError(500, "missing CMS_USER_ACCOUNT_API_KEY");
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

async function uploadAvatarFile(userId: string, file: File): Promise<string> {
    const contentType = file.type.toLowerCase();
    const extension = avatarContentTypes.get(contentType);
    if (!extension) throw new HttpError(400, "unsupported avatar content type");

    const fileId = `${await avatarPrefix(userId)}/${crypto.randomUUID()}${extension}`;
    const response = await storage(fileId, {
        method: "POST",
        headers: {
            "cache-control": "3600",
            "content-type": contentType,
        },
        body: file,
    });
    if (!response.ok) throw await storageError(response);
    return fileId;
}

async function serveAvatarFile(userId: string, fileId: string): Promise<Response> {
    const prefix = `${await avatarPrefix(userId)}/`;
    if (!fileId.startsWith(prefix)) throw new HttpError(404, "avatar not found");

    const row = await getAccountRow(userId);
    if (row?.avatar_file_id !== fileId) throw new HttpError(404, "avatar not found");

    const response = await storage(fileId, { method: "GET" });
    if (response.status === 404) throw new HttpError(404, "avatar not found");
    if (!response.ok) throw await storageError(response);

    const headers = new Headers(corsHeaders);
    copyResponseHeader(response, headers, "content-type", "application/octet-stream");
    headers.set("cache-control", "private, max-age=3600");
    copyResponseHeader(response, headers, "etag");
    copyResponseHeader(response, headers, "last-modified");
    copyResponseHeader(response, headers, "content-length");
    return new Response(response.body, { status: 200, headers });
}

async function storage(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);

    const bucket = encodeURIComponent(avatarBucket);
    const objectPath = path.split("/").map(encodeURIComponent).join("/");
    return fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, { ...init, headers });
}

async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null);
    const message = isRecord(data) && typeof data.message === "string"
        ? data.message
        : `Supabase request failed (${response.status})`;
    return new HttpError(502, message);
}

async function storageError(response: Response): Promise<HttpError> {
    const text = await response.text().catch(() => "");
    let message = text.trim();
    try {
        const data = JSON.parse(text);
        if (isRecord(data) && typeof data.message === "string") message = data.message;
        if (isRecord(data) && typeof data.error === "string") message = data.error;
    } catch {
        // Keep the raw text fallback.
    }
    return new HttpError(502, message || `Supabase Storage request failed (${response.status})`);
}

async function avatarPrefix(userId: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
    return `avatars/${hexDigest(digest)}`;
}

function hexDigest(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)]
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function copyResponseHeader(source: Response, target: Headers, name: string, fallback?: string): void {
    const value = source.headers.get(name) ?? fallback;
    if (value) target.set(name, value);
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

async function readUploadFile(request: Request): Promise<File> {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
        throw new HttpError(400, "avatar upload must use multipart/form-data");
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        throw new HttpError(400, "invalid multipart body");
    }

    const value = formData.get("file");
    if (!(value instanceof File)) throw new HttpError(400, "file is required");
    if (value.size <= 0) throw new HttpError(400, "file is empty");
    if (value.size > maxAvatarBytes) throw new HttpError(413, "file is too large");
    if (!avatarContentTypes.has(value.type.toLowerCase())) {
        throw new HttpError(400, "file must be a JPEG, PNG, WebP, or GIF image");
    }
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

function requiredText(body: JsonRecord, name: string, maxLength: number): string {
    const value = optionalText(body, name, maxLength);
    if (!value) throw new HttpError(400, `${name} is required`);
    return value;
}

function optionalBoolean(body: JsonRecord, name: string): boolean | undefined {
    if (!Object.hasOwn(body, name)) return undefined;
    const value = body[name];
    if (value === "true") return true;
    if (value === "false") return false;
    if (typeof value !== "boolean") throw new HttpError(400, `${name} must be a boolean`);
    return value;
}

function requiredFieldType(body: JsonRecord, name: string): "string" | "number" | "boolean" {
    const value = body[name];
    if (value === "string" || value === "number" || value === "boolean") return value;
    throw new HttpError(400, `${name} must be string, number, or boolean`);
}

function fieldIdFromLabel(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || crypto.randomUUID().replace(/-/g, "_");
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

function optionalMetadata(body: JsonRecord, name: string): JsonRecord | undefined {
    if (!Object.hasOwn(body, name)) return undefined;
    const value = body[name];
    if (value === null) return {};
    if (!isRecord(value)) throw new HttpError(400, `${name} must be an object`);
    if (JSON.stringify(value).length > 16384) throw new HttpError(400, `${name} is too large`);
    return value;
}

function requiredQueryText(request: Request, name: string, maxLength: number): string {
    const value = new URL(request.url).searchParams.get(name)?.trim() ?? "";
    if (!value) throw new HttpError(400, `${name} is required`);
    if (value.length > maxLength) throw new HttpError(400, `${name} is too long`);
    return value;
}

function queryLimit(value: string | null): number {
    if (!value) return 100;
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1) throw new HttpError(400, "limit must be a positive integer");
    return Math.min(limit, 200);
}

function searchPattern(value: string | null): string | null {
    const normalized = value?.trim() ?? "";
    if (!normalized) return null;
    if (normalized.length > 160) throw new HttpError(400, "q is too long");

    const safe = normalized
        .replace(/[^A-Za-z0-9@._+\-\s]/g, " ")
        .trim()
        .replace(/\s+/g, "*");
    return safe ? `*${safe}*` : null;
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
