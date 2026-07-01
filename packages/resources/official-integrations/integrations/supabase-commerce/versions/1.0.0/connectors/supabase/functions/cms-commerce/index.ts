type JsonRecord = Record<string, unknown>;

type WriteSpec = {
    table: string;
    entityType: string;
    naturalKey: (row: JsonRecord) => JsonRecord | null;
    beforeWrite?: (row: JsonRecord, body: JsonRecord) => Promise<JsonRecord>;
    allowInsertWithId?: boolean;
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
    "access-control-allow-headers": "authorization, content-type, x-cms-user-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

const commerceSchema = "commerce";
const sortAllowlist = new Set([
    "created_at_desc",
    "created_at_asc",
    "name_asc",
    "name_desc",
    "price_asc",
    "price_desc",
]);

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (request.method === "GET" && route === "/health") return await health(request);
        if (request.method === "GET" && route === "/categories") return await categories(request);
        if (request.method === "GET" && route === "/category") return await category(request);
        if (request.method === "GET" && route === "/products") return await products(request);
        if (request.method === "GET" && route === "/product") return await product(request);
        if (request.method === "GET" && route === "/product-offers") return await productOffers(request);
        if (request.method === "GET" && route === "/category-facets") return await categoryFacets(request);

        if (request.method === "POST" && route === "/vendor") return await writeCommand(request, vendorSpec);
        if (request.method === "POST" && route === "/brand") return await writeCommand(request, brandSpec);
        if (request.method === "POST" && route === "/category") return await writeCommand(request, categorySpec);
        if (request.method === "POST" && route === "/product") return await writeCommand(request, productSpec);
        if (request.method === "POST" && route === "/product-variant") return await writeCommand(request, variantSpec);
        if (request.method === "POST" && route === "/offer") return await writeCommand(request, offerSpec);
        if (request.method === "POST" && route === "/attribute") return await writeCommand(request, attributeSpec);
        if (request.method === "POST" && route === "/attribute-option") return await writeCommand(request, attributeOptionSpec);
        if (request.method === "POST" && route === "/category-attribute") return await writeCommand(request, categoryAttributeSpec);
        if (request.method === "POST" && route === "/product-variant-axis") return await writeCommand(request, productVariantAxisSpec);
        if (request.method === "POST" && route === "/product-attribute-value") return await writeCommand(request, productAttributeValueSpec);
        if (request.method === "POST" && route === "/variant-attribute-value") return await writeCommand(request, variantAttributeValueSpec);
        if (request.method === "POST" && route === "/product-category") return await writeCommand(request, productCategorySpec);
        if (request.method === "POST" && route === "/media") return await writeCommand(request, mediaSpec);
        if (request.method === "POST" && route === "/media-link") return await mediaLink(request);
        if (request.method === "POST" && route === "/external-reference") return await writeCommand(request, externalReferenceSpec);
        if (request.method === "POST" && route === "/settings") return await settings(request);

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

const vendorSpec: WriteSpec = {
    table: "vendors",
    entityType: "vendor",
    naturalKey: row => keyFrom(row, ["slug"]),
};

const brandSpec: WriteSpec = {
    table: "brands",
    entityType: "brand",
    naturalKey: row => keyFrom(row, ["slug"]),
};

const categorySpec: WriteSpec = {
    table: "categories",
    entityType: "category",
    naturalKey: row => {
        if (!row.slug) return null;
        return { parent_id: row.parent_id ?? null, slug: row.slug };
    },
};

const productSpec: WriteSpec = {
    table: "products",
    entityType: "product",
    naturalKey: row => keyFrom(row, ["slug"]),
};

const variantSpec: WriteSpec = {
    table: "product_variants",
    entityType: "variant",
    naturalKey: row => {
        if (row.id) return { id: row.id };
        if (row.product_id && row.sku) return { product_id: row.product_id, sku: row.sku };
        if (row.product_id && row.is_default === true) return { product_id: row.product_id, is_default: true };
        throw new HttpError(400, "product variant requires id, externalReference, sku, or isDefault true");
    },
};

const offerSpec: WriteSpec = {
    table: "offers",
    entityType: "offer",
    naturalKey: row => keyFrom(row, ["vendor_id", "variant_id"]),
    beforeWrite: async row => {
        if (!row.product_id && row.variant_id) {
            const variant = await getOne("product_variants", { id: row.variant_id }, "product_id");
            if (!variant) throw new HttpError(400, "variantId does not exist");
            row.product_id = variant.product_id;
        }
        return row;
    },
};

const attributeSpec: WriteSpec = {
    table: "attributes",
    entityType: "attribute",
    naturalKey: row => keyFrom(row, ["code"]),
};

const attributeOptionSpec: WriteSpec = {
    table: "attribute_options",
    entityType: "attribute_option",
    naturalKey: row => keyFrom(row, ["attribute_id", "value"]),
};

const categoryAttributeSpec: WriteSpec = {
    table: "category_attributes",
    entityType: "category_attribute",
    naturalKey: row => keyFrom(row, ["category_id", "attribute_id"]),
};

const productVariantAxisSpec: WriteSpec = {
    table: "product_variant_axes",
    entityType: "product_variant_axis",
    naturalKey: row => keyFrom(row, ["product_id", "attribute_id"]),
};

const productAttributeValueSpec: WriteSpec = {
    table: "product_attribute_values",
    entityType: "product_attribute_value",
    naturalKey: row => keyFrom(row, ["product_id", "attribute_id"]),
};

const variantAttributeValueSpec: WriteSpec = {
    table: "variant_attribute_values",
    entityType: "variant_attribute_value",
    naturalKey: row => keyFrom(row, ["variant_id", "attribute_id"]),
};

const productCategorySpec: WriteSpec = {
    table: "product_categories",
    entityType: "product_category",
    naturalKey: row => keyFrom(row, ["product_id", "category_id"]),
};

const mediaSpec: WriteSpec = {
    table: "media",
    entityType: "media",
    naturalKey: row => {
        if (row.cms_file_id) return { cms_file_id: row.cms_file_id };
        if (row.url) return { url: row.url };
        throw new HttpError(400, "media requires cmsFileId, url, id, or externalReference");
    },
};

const externalReferenceSpec: WriteSpec = {
    table: "external_references",
    entityType: "external_reference",
    naturalKey: row => keyFrom(row, ["provider", "entity_type", "external_id"]),
};

async function health(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ ok: true });
}

async function categories(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const limit = limitParam(url, 50);
    const offset = offsetParam(url);
    const filters: string[] = [`select=${encodeURIComponent("id,parent_id,slug,full_slug,title,description,position,status,created_at,updated_at")}`];
    appendNullableFilter(filters, "parent_id", url.searchParams.get("parentId"));
    appendEqualFilter(filters, "status", url.searchParams.get("status") ?? "active");
    filters.push(`order=${encodeURIComponent("position.asc,title.asc")}`);
    filters.push(`limit=${limit}`, `offset=${offset}`);

    const rows = await restJson<JsonRecord[]>(`categories?${filters.join("&")}`, { method: "GET" });
    return json({
        items: rows.map(camelizeRecord),
        limit,
        offset,
    });
}

async function category(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const fullSlug = url.searchParams.get("fullSlug");
    if (!id && !fullSlug) throw new HttpError(400, "id or fullSlug is required");
    const filters = [`select=${encodeURIComponent("id,parent_id,slug,full_slug,title,description,position,status,created_at,updated_at")}`, "limit=1"];
    if (id) appendEqualFilter(filters, "id", id);
    else appendEqualFilter(filters, "full_slug", fullSlug);
    const rows = await restJson<JsonRecord[]>(`categories?${filters.join("&")}`, { method: "GET" });
    if (!rows[0]) throw new HttpError(404, "category not found");
    return json(camelizeRecord(rows[0]));
}

async function products(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const sort = url.searchParams.get("sort") ?? "created_at_desc";
    if (!sortAllowlist.has(sort)) throw new HttpError(400, "invalid sort");
    const result = await rpc("search_products", {
        p_category_id: numberOrNull(url.searchParams.get("categoryId")),
        p_category_full_slug: nullableString(url.searchParams.get("categoryFullSlug")),
        p_brand_id: numberOrNull(url.searchParams.get("brandId")),
        p_vendor_id: numberOrNull(url.searchParams.get("vendorId")),
        p_q: nullableString(url.searchParams.get("q")),
        p_min_price: numberOrNull(url.searchParams.get("minPrice")),
        p_max_price: numberOrNull(url.searchParams.get("maxPrice")),
        p_stock_status: nullableString(url.searchParams.get("stockStatus")),
        p_condition: nullableString(url.searchParams.get("condition")),
        p_status: url.searchParams.has("status") ? nullableString(url.searchParams.get("status")) : "active",
        p_visibility: url.searchParams.has("visibility") ? nullableString(url.searchParams.get("visibility")) : "public",
        p_sort: sort,
        p_limit: limitParam(url, 20),
        p_offset: offsetParam(url),
        p_include_total: booleanParam(url.searchParams.get("includeTotal")),
    });
    return json(camelizeValue(result));
}

async function product(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const slug = url.searchParams.get("slug");
    if (!id && !slug) throw new HttpError(400, "id or slug is required");

    const productRows = await restJson<JsonRecord[]>(
        `products?select=${encodeURIComponent("id,slug,title,description,brand_id,status,visibility,metadata,created_at,updated_at")}&${id ? `id=eq.${encodeURIComponent(id)}` : `slug=eq.${encodeURIComponent(slug!)}`}&limit=1`,
        { method: "GET" },
    );
    const row = productRows[0];
    if (!row) throw new HttpError(404, "product not found");
    const productId = row.id;

    const [variants, categoriesRows, mediaRows] = await Promise.all([
        restJson<JsonRecord[]>(
            `product_variants?product_id=eq.${encodeURIComponent(String(productId))}&select=${encodeURIComponent("id,product_id,sku,title,is_default,status,position,metadata")}&order=position.asc`,
            { method: "GET" },
        ),
        restJson<JsonRecord[]>(
            `product_categories?product_id=eq.${encodeURIComponent(String(productId))}&select=${encodeURIComponent("id,category_id,position,categories(id,parent_id,slug,full_slug,title,status)")}`,
            { method: "GET" },
        ),
        restJson<JsonRecord[]>(
            `product_media?product_id=eq.${encodeURIComponent(String(productId))}&select=${encodeURIComponent("id,sort_order,is_main,media(id,cms_file_id,url,alt,mime_type,width,height)")}&order=sort_order.asc`,
            { method: "GET" },
        ),
    ]);

    return json({
        ...camelizeRecord(row),
        variants: variants.map(camelizeRecord),
        categories: categoriesRows.map(camelizeValue),
        media: mediaRows.map(camelizeValue),
    });
}

async function productOffers(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const limit = limitParam(url, 50);
    const offset = offsetParam(url);
    const filters = [`select=${encodeURIComponent("id,vendor_id,product_id,variant_id,price_amount_minor,compare_at_price_amount_minor,currency,condition,stock_quantity,stock_status,status,metadata,created_at,updated_at")}`];
    appendEqualFilter(filters, "product_id", url.searchParams.get("productId"));
    appendEqualFilter(filters, "variant_id", url.searchParams.get("variantId"));
    appendEqualFilter(filters, "vendor_id", url.searchParams.get("vendorId"));
    appendEqualFilter(filters, "stock_status", url.searchParams.get("stockStatus"));
    appendEqualFilter(filters, "condition", url.searchParams.get("condition"));
    appendEqualFilter(filters, "status", url.searchParams.get("status") ?? "active");
    filters.push(`order=${encodeURIComponent("price_amount_minor.asc")}`);
    filters.push(`limit=${limit}`, `offset=${offset}`);

    const rows = await restJson<JsonRecord[]>(`offers?${filters.join("&")}`, { method: "GET" });
    return json({
        items: rows.map(camelizeRecord),
        limit,
        offset,
    });
}

async function categoryFacets(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const result = await rpc("category_facets", {
        p_category_id: numberOrNull(url.searchParams.get("categoryId")),
        p_category_full_slug: nullableString(url.searchParams.get("categoryFullSlug")),
        p_brand_id: numberOrNull(url.searchParams.get("brandId")),
        p_vendor_id: numberOrNull(url.searchParams.get("vendorId")),
        p_q: nullableString(url.searchParams.get("q")),
        p_min_price: numberOrNull(url.searchParams.get("minPrice")),
        p_max_price: numberOrNull(url.searchParams.get("maxPrice")),
        p_stock_status: nullableString(url.searchParams.get("stockStatus")),
        p_condition: nullableString(url.searchParams.get("condition")),
        p_status: url.searchParams.has("status") ? nullableString(url.searchParams.get("status")) : "active",
        p_visibility: url.searchParams.has("visibility") ? nullableString(url.searchParams.get("visibility")) : "public",
    });
    return json(camelizeValue(result));
}

async function writeCommand(request: Request, spec: WriteSpec): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const body = await readJsonObject(request);
        const row = await normalizeWriteRow(body, spec);
        const id = await writeByResolution(spec, row, body);
        return json({ ok: true, id: String(id) });
    });
}

async function mediaLink(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const body = await readJsonObject(request);
        const row = toDbRow(writePayload(body));
        const entityType = stringValue(body.entityType ?? body.entity_type ?? row.entity_type);
        const spec = entityType === "variant" || row.variant_id
            ? { table: "variant_media", entityType: "variant_media", naturalKey: (value: JsonRecord) => keyFrom(value, ["variant_id", "media_id"]) }
            : { table: "product_media", entityType: "product_media", naturalKey: (value: JsonRecord) => keyFrom(value, ["product_id", "media_id"]) };
        delete row.entity_type;
        const id = await writeByResolution(spec, row, body);
        return json({ ok: true, id: String(id) });
    });
}

async function settings(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const body = await readJsonObject(request);
        const payload = writePayload(body);
        let defaultVendorId = stringValue(payload.defaultVendorId ?? payload.default_vendor_id);
        const createDefaultVendor = payload.createDefaultVendor === true || payload.create_default_vendor === true;

        if (!defaultVendorId && createDefaultVendor) {
            const slug = stringValue(payload.defaultVendorSlug ?? payload.default_vendor_slug) ?? "internal-store";
            const name = stringValue(payload.defaultVendorName ?? payload.default_vendor_name) ?? "Internal Store";
            defaultVendorId = String(await writeByResolution(vendorSpec, {
                slug,
                name,
                kind: "internal",
                status: "active",
            }, {}));
        }

        const row = toDbRow(payload);
        row.id = 1;
        if (defaultVendorId) row.default_vendor_id = defaultVendorId;
        delete row.create_default_vendor;
        delete row.default_vendor_slug;
        delete row.default_vendor_name;

        const id = await writeByResolution({
            table: "commerce_settings",
            entityType: "commerce_settings",
            naturalKey: () => ({ id: 1 }),
            allowInsertWithId: true,
        }, row, body);
        return json({ ok: true, id: String(id) });
    });
}

async function normalizeWriteRow(body: JsonRecord, spec: WriteSpec): Promise<JsonRecord> {
    const row = toDbRow(writePayload(body));
    const externalId = await resolveExternalReference(body, spec.entityType);
    if (externalId && !row.id) row.id = externalId;
    if (spec.beforeWrite) return await spec.beforeWrite(row, body);
    return row;
}

async function writeByResolution(spec: WriteSpec, row: JsonRecord, body: JsonRecord): Promise<string | number> {
    if (!Object.keys(row).length) throw new HttpError(400, "body does not contain writable fields");
    const hasExplicitId = row.id !== undefined && row.id !== null && row.id !== "";
    const existing = await resolveExisting(spec, row);
    if (!existing && hasExplicitId && !spec.allowInsertWithId) {
        throw new HttpError(404, `${spec.entityType} not found`);
    }
    const written = existing
        ? await updateRow(spec.table, existing.id, row)
        : await insertRow(spec.table, row);

    await attachExternalReference(body, spec.entityType, written.id);
    return written.id as string | number;
}

async function resolveExisting(spec: WriteSpec, row: JsonRecord): Promise<JsonRecord | null> {
    if (row.id) return await getOne(spec.table, { id: row.id }, "id");
    const natural = spec.naturalKey(row);
    if (!natural) return null;
    return await getOne(spec.table, natural, "id");
}

async function insertRow(table: string, row: JsonRecord): Promise<JsonRecord> {
    const response = await rest(`${table}?select=id`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(row)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow(await response.json());
}

async function updateRow(table: string, id: unknown, row: JsonRecord): Promise<JsonRecord> {
    const patch = { ...row };
    delete patch.id;
    const response = await rest(`${table}?id=eq.${encodeURIComponent(String(id))}&select=id`, {
        method: "PATCH",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(patch)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow(await response.json());
}

async function resolveExternalReference(body: JsonRecord, expectedEntityType: string): Promise<unknown> {
    const ref = externalReferenceBody(body);
    if (!ref) return undefined;
    if (ref.entity_type && ref.entity_type !== expectedEntityType) {
        throw new HttpError(400, "externalReference entityType does not match endpoint");
    }
    const existing = await getOne("external_references", {
        provider: ref.provider,
        entity_type: expectedEntityType,
        external_id: ref.external_id,
    }, "entity_id");
    return existing?.entity_id;
}

async function attachExternalReference(body: JsonRecord, entityType: string, entityId: unknown): Promise<void> {
    const ref = externalReferenceBody(body);
    if (!ref) return;
    await writeByResolution(externalReferenceSpec, {
        provider: ref.provider,
        entity_type: entityType,
        external_id: ref.external_id,
        entity_id: entityId,
        ...(ref.metadata ? { metadata: ref.metadata } : {}),
    }, {});
}

function externalReferenceBody(body: JsonRecord): JsonRecord | null {
    const value = body.externalReference ?? body.external_reference;
    if (!isRecord(value)) return null;
    const provider = stringValue(value.provider);
    const externalId = stringValue(value.externalId ?? value.external_id);
    if (!provider || !externalId) throw new HttpError(400, "externalReference requires provider and externalId");
    return {
        provider,
        external_id: externalId,
        entity_type: stringValue(value.entityType ?? value.entity_type),
        metadata: isRecord(value.metadata) ? value.metadata : undefined,
    };
}

function writePayload(body: JsonRecord): JsonRecord {
    return isRecord(body.data) ? body.data : body;
}

function keyFrom(row: JsonRecord, keys: string[]): JsonRecord | null {
    const key: JsonRecord = {};
    for (const name of keys) {
        if (row[name] === undefined || row[name] === null || row[name] === "") return null;
        key[name] = row[name];
    }
    return key;
}

async function getOne(table: string, filters: JsonRecord, select = "*"): Promise<JsonRecord | null> {
    const params = [`select=${encodeURIComponent(select)}`, "limit=1"];
    for (const [key, value] of Object.entries(filters)) {
        if (value === null) params.push(`${key}=is.null`);
        else params.push(`${key}=eq.${encodeURIComponent(String(value))}`);
    }
    const rows = await restJson<JsonRecord[]>(`${table}?${params.join("&")}`, { method: "GET" });
    return rows[0] ?? null;
}

async function rpc(name: string, args: JsonRecord): Promise<unknown> {
    const response = await rest(`rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stripUndefined(args)),
    });
    if (!response.ok) throw await restError(response);
    return await response.json();
}

async function restJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await rest(path, init);
    if (!response.ok) throw await restError(response);
    return await response.json() as T;
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", commerceSchema);
    if (init.method && init.method !== "GET") headers.set("content-profile", commerceSchema);

    return fetch(`${base}/rest/v1/${path}`, { ...init, headers });
}

async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null);
    const message = isRecord(data) && typeof data.message === "string"
        ? data.message
        : `Supabase request failed (${response.status})`;
    return new HttpError(502, message);
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-commerce";
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
    return await handler();
}

function requireCmsWriteRequest(request: Request): void {
    requireCmsRequest(request);
    const userId = (request.headers.get("x-cms-user-id") ?? "").trim();
    if (!userId) throw new HttpError(401, "missing CMS user id");
}

function requireCmsRequest(request: Request): void {
    const expected = requiredEnv("CMS_COMMERCE_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, expected)) throw new HttpError(401, "invalid CMS API key");
}

function appendEqualFilter(filters: string[], column: string, value: string | null | undefined): void {
    if (value === undefined || value === null || value === "") return;
    filters.push(`${column}=eq.${encodeURIComponent(value)}`);
}

function appendNullableFilter(filters: string[], column: string, value: string | null | undefined): void {
    if (value === undefined || value === null || value === "") return;
    if (value === "null") filters.push(`${column}=is.null`);
    else appendEqualFilter(filters, column, value);
}

function limitParam(url: URL, fallback: number): number {
    const value = numberOrNull(url.searchParams.get("limit"));
    return Math.min(Math.max(value ?? fallback, 1), 100);
}

function offsetParam(url: URL): number {
    return Math.max(numberOrNull(url.searchParams.get("offset")) ?? 0, 0);
}

function numberOrNull(value: string | null): number | null {
    if (value === null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new HttpError(400, `${value} is not a number`);
    return parsed;
}

function booleanParam(value: string | null): boolean {
    return value === "true" || value === "1";
}

function nullableString(value: string | null): string | null {
    if (value === null || value === "") return null;
    return value;
}

function stringValue(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toDbRow(input: JsonRecord): JsonRecord {
    const row: JsonRecord = {};
    for (const [key, value] of Object.entries(input)) {
        if (key === "externalReference" || key === "external_reference" || key === "data") continue;
        row[snakeCase(key)] = value;
    }
    return stripUndefined(row);
}

function snakeCase(value: string): string {
    return value.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`);
}

function camelizeValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(camelizeValue);
    if (!isRecord(value)) return value;
    return camelizeRecord(value);
}

function camelizeRecord(value: JsonRecord): JsonRecord {
    const result: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
        result[camelCase(key)] = camelizeValue(entry);
    }
    return result;
}

function camelCase(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function firstRow(value: unknown): JsonRecord {
    if (!Array.isArray(value) || !isRecord(value[0])) throw new HttpError(502, "Supabase returned no rows");
    return value[0];
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
