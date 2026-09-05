export const DEV_STORE_FUNCTION = `type JsonRecord = Record<string, unknown>;

class HttpError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

Deno.serve(async (request: Request) => {
    try {
        requireCmsRequest(request);
        const route = routePath(request);
        if (request.method === "POST" && route === "/record") {
            return Response.json(await upsertRecord(await request.json()));
        }
        if (request.method === "GET" && route === "/records") {
            return Response.json({ records: await listRecords() });
        }
        return Response.json({ error: "not found" }, { status: 404 });
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
    }
});

async function upsertRecord(value: unknown): Promise<JsonRecord> {
    const record = asRecord(value);
    const key = requiredString(record.key, "key");
    const storedValue = requiredString(record.value, "value");
    const query = new URLSearchParams({ on_conflict: "key", select: "key,value" });
    const response = await rest("records?" + query, {
        method: "POST",
        headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ key, value: storedValue }),
    });
    const rows = await response.json() as JsonRecord[];
    if (!response.ok || !rows[0]) {
        throw new HttpError(502, "record upsert failed");
    }
    return rows[0];
}

async function listRecords(): Promise<JsonRecord[]> {
    const response = await rest("records?select=key,value&order=key.asc", { method: "GET" });
    if (!response.ok) {
        throw new HttpError(502, "record listing failed");
    }
    return await response.json() as JsonRecord[];
}

function rest(path: string, init: RequestInit): Promise<Response> {
    const base = requiredEnvironment("SUPABASE_URL").replace(/\\/$/, "");
    const key = serviceRoleKey();
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", "Bearer " + key);
    headers.set("accept-profile", "dev_store");
    if (init.method !== "GET") {
        headers.set("content-profile", "dev_store");
    }
    return fetch(base + "/rest/v1/" + path, { ...init, headers });
}

function requireCmsRequest(request: Request): void {
    const expected = requiredEnvironment("CMS_DEV_STORE_API_KEY");
    if (request.headers.get("authorization") !== "Bearer " + expected) {
        throw new HttpError(401, "invalid CMS API key");
    }
}

function serviceRoleKey(): string {
    return requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY").split(",", 1)[0]!.trim();
}

function requiredEnvironment(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) {
        throw new HttpError(500, "missing " + name);
    }
    return value;
}

function routePath(request: Request): string {
    const path = new URL(request.url).pathname.replace(/\\/+$/, "");
    const marker = "/cms-dev-store";
    const offset = path.indexOf(marker);
    return offset < 0 ? path : path.slice(offset + marker.length) || "/";
}

function asRecord(value: unknown): JsonRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new HttpError(400, "JSON object required");
    }
    return value as JsonRecord;
}

function requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new HttpError(400, name + " is required");
    }
    return value.trim();
}
`;
