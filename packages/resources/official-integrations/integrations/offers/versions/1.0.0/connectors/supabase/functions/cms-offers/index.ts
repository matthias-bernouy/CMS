type JsonRecord = Record<string, unknown>;

type OfferRow = {
    id: number | string;
    slug: string;
    title: string;
    description?: string | null;
    product_id?: string | null;
    variant_id?: string | null;
    seller_kind: string;
    seller_id: string;
    price_amount: number;
    currency: string;
    compare_at_amount?: number | null;
    tax_behavior: string;
    status: string;
    visibility: string;
    availability: string;
    quantity_available?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    metadata?: JsonRecord;
    created_at?: string;
    updated_at?: string;
};

type ExternalReferenceRow = {
    provider: string;
    entity_type: string;
    entity_id: number | string;
    external_id: string;
    metadata?: JsonRecord;
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
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
};

const offersSchema = "offers";
const offerSelect = [
    "id",
    "slug",
    "title",
    "description",
    "product_id",
    "variant_id",
    "seller_kind",
    "seller_id",
    "price_amount",
    "currency",
    "compare_at_amount",
    "tax_behavior",
    "status",
    "visibility",
    "availability",
    "quantity_available",
    "starts_at",
    "ends_at",
    "metadata",
    "created_at",
    "updated_at",
].join(",");

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health(request));
        if (route === "/offers") return await withMethod(request, "GET", () => listOffers(request));
        if (route === "/my-offers") return await withMethod(request, "GET", () => listMyOffers(request));
        if (route === "/offer/defaults") return await withMethod(request, "GET", () => offerDefaults(request));
        if (route === "/offer/archive") return await withMethod(request, "POST", () => archiveOffer(request));
        if (route === "/my-offer") return await withMethod(request, "POST", () => upsertMyOffer(request));
        if (route === "/offer") return await offerRoute(request);

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function offerRoute(request: Request): Promise<Response> {
    if (request.method === "GET") return getOffer(request);
    if (request.method === "POST") return upsertOffer(request);
    if (request.method === "DELETE") return deleteOffer(request);
    return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...corsHeaders, allow: "GET, POST, DELETE, OPTIONS" },
    });
}

async function health(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ ok: true });
}

function offerDefaults(request: Request): Response {
    requireCmsRequest(request);
    return json(defaultOffer());
}

async function listOffers(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const url = new URL(request.url);
    const query = listQuery(url);
    appendTextSearch(query, url);
    appendEqualQuery(query, "status", url.searchParams.get("status"));
    appendEqualQuery(query, "visibility", url.searchParams.get("visibility"));
    appendEqualQuery(query, "seller_kind", url.searchParams.get("sellerKind"));
    appendEqualQuery(query, "seller_id", url.searchParams.get("sellerId"));
    appendEqualQuery(query, "product_id", url.searchParams.get("productId"));
    appendEqualQuery(query, "variant_id", url.searchParams.get("variantId"));
    appendEqualQuery(query, "currency", normalizeOptionalCurrency(url.searchParams.get("currency")));

    const response = await rest(`offers?${query.toString()}`, {
        method: "GET",
        headers: { prefer: "count=exact" },
    });
    if (!response.ok) throw await restError(response);

    const rows = await response.json() as OfferRow[];
    return json({
        items: rows.map(publicOffer),
        total: countFromContentRange(response.headers.get("content-range")) ?? rows.length,
        limit: boundedLimit(url.searchParams.get("limit")),
        offset: boundedOffset(url.searchParams.get("offset")),
    });
}

async function listMyOffers(request: Request): Promise<Response> {
    const userId = requireUserId(request);
    const url = new URL(request.url);
    url.searchParams.set("sellerKind", "user");
    url.searchParams.set("sellerId", userId);
    return listOffers(new Request(url.toString(), { method: "GET", headers: request.headers }));
}

async function getOffer(request: Request): Promise<Response> {
    requireCmsRequest(request);

    const url = new URL(request.url);
    if (url.searchParams.get("id") === "__new__") return json(defaultOffer());
    const row = await offerByIdOrSlug(url);
    if (!row) throw new HttpError(404, "offer not found");
    return json(publicOffer(row));
}

async function upsertOffer(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json(publicOffer(await writeOffer(request)));
}

async function upsertMyOffer(request: Request): Promise<Response> {
    const userId = requireUserId(request);
    return json(publicOffer(await writeOffer(request, { sellerKind: "user", sellerId: userId })));
}

async function writeOffer(
    request: Request,
    sellerOverride?: { sellerKind: "user"; sellerId: string },
): Promise<OfferRow> {
    const url = new URL(request.url);
    const body = await readJsonObject(request);
    const { data, externalReference } = commandPayload(body);
    const explicitId = cleanId(url.searchParams.get("id"));
    const externalRow = externalReference ? await findExternalReference(externalReference) : null;
    const targetId = explicitId ?? externalRow?.entity_id;
    const patch = offerPatch(data, sellerOverride);
    const row = targetId
        ? await updateOfferRow(targetId, patch)
        : await createOfferRow(createOfferPayload(patch));

    if (externalReference && !externalRow) {
        await createExternalReference(row.id, externalReference);
    }

    return row;
}

async function archiveOffer(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const id = requiredQuery(new URL(request.url), "id");
    const row = await updateOfferRow(id, { status: "archived", availability: "unavailable" });
    return json(publicOffer(row));
}

async function deleteOffer(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const id = requiredQuery(new URL(request.url), "id");
    const row = await deleteOfferRow(id);
    return json({ deleted: Boolean(row), id });
}

function defaultOffer(): JsonRecord {
    return {
        slug: "",
        title: "",
        description: "",
        productId: "",
        variantId: "",
        sellerKind: "merchant",
        sellerId: "default",
        priceAmount: 0,
        currency: "eur",
        compareAtAmount: null,
        taxBehavior: "unspecified",
        status: "draft",
        visibility: "public",
        availability: "available",
        quantityAvailable: null,
        startsAt: "",
        endsAt: "",
        metadata: {},
    };
}

function offerPatch(
    body: JsonRecord,
    sellerOverride?: { sellerKind: "user"; sellerId: string },
): JsonRecord {
    const patch: JsonRecord = {};
    textPatch(patch, body, "slug", "slug", { trim: true });
    textPatch(patch, body, "title", "title", { trim: true });
    textPatch(patch, body, "description", "description", { trim: true, emptyAsNull: true });
    textPatch(patch, body, "productId", "product_id", { trim: true, emptyAsNull: true });
    textPatch(patch, body, "variantId", "variant_id", { trim: true, emptyAsNull: true });
    integerPatch(patch, body, "priceAmount", "price_amount", { min: 0 });
    integerPatch(patch, body, "compareAtAmount", "compare_at_amount", { min: 0, emptyAsNull: true });
    integerPatch(patch, body, "quantityAvailable", "quantity_available", { min: 0, emptyAsNull: true });
    datePatch(patch, body, "startsAt", "starts_at");
    datePatch(patch, body, "endsAt", "ends_at");

    if (has(body, "currency")) patch.currency = currencyField(body.currency, "currency");
    if (has(body, "sellerKind")) patch.seller_kind = enumField(body.sellerKind, "sellerKind", ["merchant", "user", "external"]);
    if (has(body, "sellerId")) {
        const sellerId = textValue(body.sellerId, "sellerId").trim();
        patch.seller_id = sellerId || "default";
    }
    if (has(body, "taxBehavior")) {
        patch.tax_behavior = enumField(body.taxBehavior, "taxBehavior", ["included", "excluded", "unspecified"]);
    }
    if (has(body, "status")) patch.status = enumField(body.status, "status", ["draft", "active", "paused", "archived"]);
    if (has(body, "visibility")) patch.visibility = enumField(body.visibility, "visibility", ["public", "hidden"]);
    if (has(body, "availability")) {
        patch.availability = enumField(body.availability, "availability", ["available", "unavailable", "sold_out", "preorder"]);
    }
    if (has(body, "metadata")) {
        if (!isRecord(body.metadata)) throw new HttpError(400, "metadata must be an object");
        patch.metadata = body.metadata;
    }

    if (sellerOverride) {
        patch.seller_kind = sellerOverride.sellerKind;
        patch.seller_id = sellerOverride.sellerId;
    }

    if (patch.seller_kind && patch.seller_kind !== "merchant" && !patch.seller_id) {
        throw new HttpError(400, "sellerId is required for user and external sellers");
    }

    return patch;
}

function createOfferPayload(patch: JsonRecord): JsonRecord {
    const slug = requiredTextFromPatch(patch, "slug");
    const title = requiredTextFromPatch(patch, "title");
    const sellerKind = typeof patch.seller_kind === "string" ? patch.seller_kind : "merchant";
    const sellerId = typeof patch.seller_id === "string" && patch.seller_id.trim()
        ? patch.seller_id.trim()
        : sellerKind === "merchant"
            ? "default"
            : "";
    if (!sellerId) throw new HttpError(400, "sellerId is required for user and external sellers");

    return {
        ...patch,
        slug,
        title,
        seller_kind: sellerKind,
        seller_id: sellerId,
        price_amount: typeof patch.price_amount === "number" ? patch.price_amount : 0,
        currency: typeof patch.currency === "string" ? patch.currency : "eur",
        tax_behavior: typeof patch.tax_behavior === "string" ? patch.tax_behavior : "unspecified",
        status: typeof patch.status === "string" ? patch.status : "draft",
        visibility: typeof patch.visibility === "string" ? patch.visibility : "public",
        availability: typeof patch.availability === "string" ? patch.availability : "available",
        metadata: isRecord(patch.metadata) ? patch.metadata : {},
    };
}

function commandPayload(body: JsonRecord): {
    data: JsonRecord;
    externalReference: { provider: string; externalId: string; metadata?: JsonRecord } | null;
} {
    const externalReference = parseExternalReference(body.externalReference);
    const data = isRecord(body.data) ? body.data : body;
    return { data, externalReference };
}

function parseExternalReference(value: unknown): { provider: string; externalId: string; metadata?: JsonRecord } | null {
    if (value === undefined || value === null) return null;
    if (!isRecord(value)) throw new HttpError(400, "externalReference must be an object");
    const provider = textValue(value.provider, "externalReference.provider").trim();
    const externalId = textValue(value.externalId, "externalReference.externalId").trim();
    if (!provider) throw new HttpError(400, "externalReference.provider is required");
    if (!externalId) throw new HttpError(400, "externalReference.externalId is required");
    if (value.metadata !== undefined && !isRecord(value.metadata)) {
        throw new HttpError(400, "externalReference.metadata must be an object");
    }
    return {
        provider,
        externalId,
        ...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
    };
}

async function createOfferRow(row: JsonRecord): Promise<OfferRow> {
    const query = new URLSearchParams();
    query.set("select", offerSelect);

    const response = await rest(`offers?${query.toString()}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(row)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow<OfferRow>(await response.json());
}

async function updateOfferRow(id: number | string, patch: JsonRecord): Promise<OfferRow> {
    const query = new URLSearchParams();
    query.set("select", offerSelect);
    query.set("id", `eq.${id}`);

    const response = await rest(`offers?${query.toString()}`, {
        method: "PATCH",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(patch)),
    });
    if (!response.ok) throw await restError(response);
    const row = firstRow<OfferRow>(await response.json());
    if (!row) throw new HttpError(404, "offer not found");
    return row;
}

async function deleteOfferRow(id: string): Promise<OfferRow | null> {
    const query = new URLSearchParams();
    query.set("select", offerSelect);
    query.set("id", `eq.${id}`);

    const response = await rest(`offers?${query.toString()}`, {
        method: "DELETE",
        headers: { prefer: "return=representation" },
    });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as OfferRow[];
    return rows[0] ?? null;
}

async function offerByIdOrSlug(url: URL): Promise<OfferRow | null> {
    const id = cleanId(url.searchParams.get("id"));
    if (id) return await offerBy("id", id);
    const slug = (url.searchParams.get("slug") ?? "").trim();
    if (slug) return await offerBy("slug", slug);
    throw new HttpError(400, "id or slug is required");
}

async function offerBy(column: "id" | "slug", value: string | number): Promise<OfferRow | null> {
    const query = new URLSearchParams();
    query.set("select", offerSelect);
    query.set(column, `eq.${value}`);
    query.set("limit", "1");

    const response = await rest(`offers?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as OfferRow[];
    return rows[0] ?? null;
}

async function findExternalReference(
    ref: { provider: string; externalId: string },
): Promise<ExternalReferenceRow | null> {
    const query = new URLSearchParams();
    query.set("select", "provider,entity_type,entity_id,external_id,metadata");
    query.set("provider", `eq.${ref.provider}`);
    query.set("entity_type", "eq.offer");
    query.set("external_id", `eq.${ref.externalId}`);
    query.set("limit", "1");

    const rows = await restJson<ExternalReferenceRow[]>(`external_references?${query.toString()}`, { method: "GET" });
    return rows[0] ?? null;
}

async function createExternalReference(
    entityId: number | string,
    ref: { provider: string; externalId: string; metadata?: JsonRecord },
): Promise<void> {
    const response = await rest("external_references", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=minimal",
        },
        body: JSON.stringify({
            provider: ref.provider,
            entity_type: "offer",
            entity_id: entityId,
            external_id: ref.externalId,
            metadata: ref.metadata ?? {},
        }),
    });
    if (!response.ok) throw await restError(response);
}

function publicOffer(row: OfferRow): JsonRecord {
    return {
        id: numericId(row.id),
        slug: row.slug,
        title: row.title,
        description: row.description ?? "",
        productId: row.product_id ?? "",
        variantId: row.variant_id ?? "",
        sellerKind: row.seller_kind,
        sellerId: row.seller_id,
        priceAmount: row.price_amount,
        currency: row.currency,
        compareAtAmount: row.compare_at_amount ?? null,
        taxBehavior: row.tax_behavior,
        status: row.status,
        visibility: row.visibility,
        availability: row.availability,
        quantityAvailable: row.quantity_available ?? null,
        startsAt: row.starts_at ?? "",
        endsAt: row.ends_at ?? "",
        metadata: row.metadata ?? {},
        ...(row.created_at ? { createdAt: row.created_at } : {}),
        ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    };
}

function listQuery(url: URL): URLSearchParams {
    const query = new URLSearchParams();
    query.set("select", offerSelect);
    query.set("order", "updated_at.desc");
    query.set("limit", String(boundedLimit(url.searchParams.get("limit"))));
    const offset = boundedOffset(url.searchParams.get("offset"));
    if (offset > 0) query.set("offset", String(offset));
    return query;
}

function appendEqualQuery(query: URLSearchParams, column: string, value: string | null): void {
    const text = (value ?? "").trim();
    if (text) query.set(column, `eq.${text}`);
}

function appendTextSearch(query: URLSearchParams, url: URL): void {
    const q = optionalSearch(url.searchParams.get("q"));
    if (q) query.set("title", `ilike.*${q}*`);
}

function boundedLimit(value: string | null, fallback = 100): number {
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new HttpError(400, "limit must be a positive integer");
    return Math.min(parsed, 200);
}

function boundedOffset(value: string | null): number {
    if (!value) return 0;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new HttpError(400, "offset must be a non-negative integer");
    return parsed;
}

function optionsResponse(): Response {
    return new Response("ok", { headers: corsHeaders });
}

async function withMethod(request: Request, method: string, handler: () => Promise<Response> | Response): Promise<Response> {
    if (request.method !== method) {
        return new Response("Method Not Allowed", {
            status: 405,
            headers: { ...corsHeaders, allow: `${method}, OPTIONS` },
        });
    }
    return await handler();
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-offers";
    const index = pathname.indexOf(marker);
    if (index === -1) return pathname || "/";
    return pathname.slice(index + marker.length) || "/";
}

function requireCmsRequest(request: Request): void {
    const expected = requiredEnv("CMS_OFFERS_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, expected)) throw new HttpError(401, "invalid CMS API key");
}

function requireUserId(request: Request): string {
    requireCmsRequest(request);
    const userId = (request.headers.get("x-user-id") ?? "").trim();
    if (!userId) throw new HttpError(401, "missing CMS user id");
    return userId;
}

async function restJson<T>(path: string, init: RequestInit, schema = offersSchema): Promise<T> {
    const response = await rest(path, init, schema);
    if (!response.ok) throw await restError(response);
    return await response.json() as T;
}

async function rest(path: string, init: RequestInit, schema = offersSchema): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", schema);
    if (init.method && init.method !== "GET" && init.method !== "HEAD") headers.set("content-profile", schema);

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
    if (!Array.isArray(value) || !value[0]) throw new HttpError(404, "offer not found");
    return value[0] as T;
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

function textPatch(
    patch: JsonRecord,
    body: JsonRecord,
    input: string,
    column: string,
    options: { trim?: boolean; emptyAsNull?: boolean } = {},
): void {
    if (!has(body, input)) return;
    const value = textValue(body[input], input);
    const text = options.trim ? value.trim() : value;
    patch[column] = !text && options.emptyAsNull ? null : text;
}

function integerPatch(
    patch: JsonRecord,
    body: JsonRecord,
    input: string,
    column: string,
    options: { min?: number; emptyAsNull?: boolean } = {},
): void {
    if (!has(body, input)) return;
    const value = body[input];
    if ((value === "" || value === null) && options.emptyAsNull) {
        patch[column] = null;
        return;
    }
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
    if (!Number.isInteger(parsed)) throw new HttpError(400, `${input} must be an integer`);
    if (options.min !== undefined && parsed < options.min) throw new HttpError(400, `${input} must be at least ${options.min}`);
    patch[column] = parsed;
}

function datePatch(patch: JsonRecord, body: JsonRecord, input: string, column: string): void {
    if (!has(body, input)) return;
    const value = body[input];
    if (value === "" || value === null) {
        patch[column] = null;
        return;
    }
    const text = textValue(value, input).trim();
    if (!Number.isFinite(Date.parse(text))) throw new HttpError(400, `${input} must be a valid date`);
    patch[column] = text;
}

function enumField(value: unknown, name: string, allowed: string[]): string {
    const text = textValue(value, name).trim();
    if (!allowed.includes(text)) throw new HttpError(400, `${name} is invalid`);
    return text;
}

function currencyField(value: unknown, name: string): string {
    const text = textValue(value, name).trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(text)) throw new HttpError(400, `${name} must be a 3-letter currency`);
    return text;
}

function normalizeOptionalCurrency(value: string | null): string | null {
    const text = (value ?? "").trim();
    return text ? currencyField(text, "currency") : null;
}

function textValue(value: unknown, name: string): string {
    if (typeof value !== "string") throw new HttpError(400, `${name} must be a string`);
    return value;
}

function requiredTextFromPatch(patch: JsonRecord, name: string): string {
    const value = patch[name];
    if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${name} is required`);
    return value.trim();
}

function optionalSearch(value: string | null): string | null {
    const search = (value ?? "").trim();
    if (!search) return null;
    return search.slice(0, 120).replace(/[*,()%_]/g, "");
}

function requiredQuery(url: URL, name: string): string {
    const value = cleanId(url.searchParams.get(name));
    if (!value) throw new HttpError(400, `${name} is required`);
    return value;
}

function cleanId(value: string | null): string | null {
    const text = (value ?? "").trim();
    return text && text !== "__new__" ? text : null;
}

function numericId(value: string | number): number | string {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
}

function countFromContentRange(value: string | null): number | null {
    if (!value) return null;
    const total = value.split("/")[1];
    if (!total || total === "*") return null;
    const parsed = Number(total);
    return Number.isFinite(parsed) ? parsed : null;
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

function has(value: JsonRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
