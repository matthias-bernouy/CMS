type JsonRecord = Record<string, unknown>;

type OrderStatus = "draft" | "placed" | "cancelled" | "completed" | "archived";

type OrderRow = {
    id: string;
    order_number: string | null;
    seller_cms_user_id: string;
    buyer_cms_user_id: string | null;
    buyer_email: string | null;
    buyer_name: string | null;
    buyer_phone: string | null;
    status: OrderStatus;
    currency: string;
    subtotal_amount: number;
    total_amount: number;
    billing_address: JsonRecord;
    shipping_address: JsonRecord;
    metadata: JsonRecord;
    placed_at: string | null;
    cancelled_at: string | null;
    completed_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
};

type OrderLineRow = {
    id: number;
    order_id: string;
    title: string;
    sku: string | null;
    quantity: number;
    unit_amount: number;
    line_total: number;
    currency: string;
    product_snapshot: JsonRecord;
    variant_snapshot: JsonRecord;
    metadata: JsonRecord;
    created_at: string;
};

type OrderEventRow = {
    id: number;
    order_id: string;
    event_type: string;
    actor_user_id: string | null;
    message: string | null;
    data: JsonRecord;
    created_at: string;
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

const ordersSchema = "orders";
const orderSelect = [
    "id",
    "order_number",
    "seller_cms_user_id",
    "buyer_cms_user_id",
    "buyer_email",
    "buyer_name",
    "buyer_phone",
    "status",
    "currency",
    "subtotal_amount",
    "total_amount",
    "billing_address",
    "shipping_address",
    "metadata",
    "placed_at",
    "cancelled_at",
    "completed_at",
    "created_by",
    "created_at",
    "updated_at",
].join(",");
const lineSelect = [
    "id",
    "order_id",
    "title",
    "sku",
    "quantity",
    "unit_amount",
    "line_total",
    "currency",
    "product_snapshot",
    "variant_snapshot",
    "metadata",
    "created_at",
].join(",");
const eventSelect = [
    "id",
    "order_id",
    "event_type",
    "actor_user_id",
    "message",
    "data",
    "created_at",
].join(",");

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health(request));
        if (route === "/orders") {
            if (request.method === "GET") return await listOrders(request);
            if (request.method === "POST") return await createOrder(request);
            return methodNotAllowed("GET, POST, OPTIONS");
        }
        if (route === "/order") return await withMethod(request, "GET", () => getOrder(request));
        if (route === "/my-orders") return await withMethod(request, "GET", () => listMyOrders(request));
        if (route === "/my-order") return await withMethod(request, "GET", () => getMyOrder(request));
        if (route === "/order/status") return await withMethod(request, "POST", () => updateOrderStatus(request));
        if (route === "/order/events") return await withMethod(request, "GET", () => orderEvents(request));
        if (route === "/order/defaults") return await withMethod(request, "GET", () => orderDefaults(request));

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function health(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    return json({ ok: true });
}

async function orderDefaults(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    return json({
        id: crypto.randomUUID(),
        status: "draft",
        currency: "eur",
        lines: [],
        billingAddress: {},
        shippingAddress: {},
        metadata: {},
    });
}

async function listOrders(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });

    const url = new URL(request.url);
    const limit = boundedLimit(url.searchParams.get("limit"), 100);
    const offset = boundedOffset(url.searchParams.get("offset"));
    const status = optionalOrderStatus(url.searchParams.get("status"));
    const sellerUserId = optionalText(url.searchParams.get("sellerUserId"), 200);
    const buyerUserId = optionalText(url.searchParams.get("buyerUserId"), 200);
    const q = optionalSearch(url.searchParams.get("q"));

    const query = new URLSearchParams();
    query.set("select", orderSelect);
    query.set("order", "created_at.desc");
    query.set("limit", String(limit));
    query.set("offset", String(offset));
    if (status) query.set("status", `eq.${status}`);
    if (sellerUserId) query.set("seller_cms_user_id", `eq.${sellerUserId}`);
    if (buyerUserId) query.set("buyer_cms_user_id", `eq.${buyerUserId}`);
    if (q) {
        query.set("or", `(${[
            `id.ilike.*${q}*`,
            `order_number.ilike.*${q}*`,
            `buyer_email.ilike.*${q}*`,
            `buyer_name.ilike.*${q}*`,
        ].join(",")})`);
    }

    const response = await rest(`orders?${query.toString()}`, {
        method: "GET",
        headers: { prefer: "count=exact" },
    });
    if (!response.ok) throw await restError(response);

    const rows = await response.json() as OrderRow[];
    return json({
        items: rows.map(publicOrderSummary),
        total: countFromContentRange(response.headers.get("content-range")) ?? rows.length,
        limit,
        offset,
    });
}

async function listMyOrders(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const url = new URL(request.url);
    const limit = boundedLimit(url.searchParams.get("limit"), 50);
    const offset = boundedOffset(url.searchParams.get("offset"));
    const status = optionalOrderStatus(url.searchParams.get("status"));

    const query = new URLSearchParams();
    query.set("select", orderSelect);
    query.set("order", "created_at.desc");
    query.set("limit", String(limit));
    query.set("offset", String(offset));
    query.set("or", `(buyer_cms_user_id.eq.${userId},seller_cms_user_id.eq.${userId})`);
    if (status) query.set("status", `eq.${status}`);

    const response = await rest(`orders?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as OrderRow[];
    return json({ items: rows.map(publicOrderSummary), total: rows.length, limit, offset });
}

async function getOrder(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const url = new URL(request.url);
    const id = optionalText(url.searchParams.get("id"), 200);
    const orderNumber = optionalText(url.searchParams.get("orderNumber"), 120);
    if (!id && !orderNumber) throw new HttpError(400, "id or orderNumber is required");
    const order = id ? await getOrderRow(id) : await getOrderByNumber(orderNumber!);
    if (!order) throw new HttpError(404, "order not found");
    return json(await publicOrderDetail(order));
}

async function getMyOrder(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const url = new URL(request.url);
    const id = optionalText(url.searchParams.get("id"), 200);
    const orderNumber = optionalText(url.searchParams.get("orderNumber"), 120);
    if (!id && !orderNumber) throw new HttpError(400, "id or orderNumber is required");
    const order = id ? await getOrderRow(id) : await getOrderByNumber(orderNumber!);
    if (!order) throw new HttpError(404, "order not found");
    if (order.buyer_cms_user_id !== userId && order.seller_cms_user_id !== userId) {
        throw new HttpError(404, "order not found");
    }
    return json(await publicOrderDetail(order));
}

async function createOrder(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    const payload = orderPayload(body, userId || undefined);

    const order = await insertOrder(payload.order);
    const lines = await insertOrderLines(order.id, payload.lines);
    await insertEvent(order.id, {
        event_type: "order.created",
        actor_user_id: userId || undefined,
        message: "Order created",
        data: {
            status: order.status,
            totalAmount: order.total_amount,
            lineCount: lines.length,
        },
    });

    return json(await publicOrderDetail(order, lines), 201);
}

async function updateOrderStatus(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    const id = requiredText(body.orderId ?? body.id, "orderId", 200);
    const status = orderStatusValue(body.status, "status");
    const message = optionalTextValue(body.message, "message", 1000);
    const order = await getOrderRow(id);
    if (!order) throw new HttpError(404, "order not found");

    const timestampPatch: JsonRecord = {};
    if (status === "placed" && !order.placed_at) timestampPatch.placed_at = new Date().toISOString();
    if (status === "cancelled" && !order.cancelled_at) timestampPatch.cancelled_at = new Date().toISOString();
    if (status === "completed" && !order.completed_at) timestampPatch.completed_at = new Date().toISOString();

    const updated = await patchOrderRow(id, { status, ...timestampPatch });
    await insertEvent(id, {
        event_type: "order.status_changed",
        actor_user_id: userId || undefined,
        message,
        data: { previousStatus: order.status, status },
    });
    return json(await publicOrderDetail(updated));
}

async function orderEvents(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const orderId = requiredQueryText(request, "orderId", 200);
    const events = await getOrderEvents(orderId);
    return json({ items: events.map(publicEvent), total: events.length });
}

function orderPayload(body: JsonRecord, actorUserId: string | undefined): {
    order: JsonRecord;
    lines: JsonRecord[];
} {
    const currency = currencyValue(body.currency ?? "eur", "currency");
    const lines = arrayField(body, "lines").map((line, index) => orderLinePayload(line, index, currency));
    if (!lines.length) throw new HttpError(400, "lines must contain at least one item");
    const sellerUserId = requiredText(body.sellerUserId ?? body.seller_cms_user_id, "sellerUserId", 200);
    const subtotalAmount = lines.reduce((sum, line) => sum + numberRecordValue(line, "line_total"), 0);
    const explicitTotal = optionalInteger(body.totalAmount ?? body.total_amount, "totalAmount");
    if (explicitTotal !== undefined && explicitTotal !== subtotalAmount) {
        throw new HttpError(400, "totalAmount must equal the sum of order lines");
    }

    const status = orderStatusValue(body.status ?? "draft", "status");
    return {
        order: stripUndefined({
            id: optionalTextValue(body.id, "id", 200) ?? crypto.randomUUID(),
            order_number: optionalTextValue(body.orderNumber ?? body.order_number, "orderNumber", 120),
            seller_cms_user_id: sellerUserId,
            buyer_cms_user_id: optionalTextValue(body.buyerUserId ?? body.buyer_cms_user_id, "buyerUserId", 200),
            buyer_email: optionalEmail(body.buyerEmail ?? body.buyer_email, "buyerEmail"),
            buyer_name: optionalTextValue(body.buyerName ?? body.buyer_name, "buyerName", 200),
            buyer_phone: optionalTextValue(body.buyerPhone ?? body.buyer_phone, "buyerPhone", 80),
            status,
            currency,
            subtotal_amount: subtotalAmount,
            total_amount: subtotalAmount,
            billing_address: objectValue(body.billingAddress ?? body.billing_address, "billingAddress"),
            shipping_address: objectValue(body.shippingAddress ?? body.shipping_address, "shippingAddress"),
            metadata: objectValue(body.metadata, "metadata"),
            placed_at: status === "placed" ? new Date().toISOString() : undefined,
            cancelled_at: status === "cancelled" ? new Date().toISOString() : undefined,
            completed_at: status === "completed" ? new Date().toISOString() : undefined,
            created_by: actorUserId,
        }),
        lines,
    };
}

function orderLinePayload(value: unknown, index: number, orderCurrency: string): JsonRecord {
    if (!isRecord(value)) throw new HttpError(400, `lines.${index} must be an object`);
    const quantity = positiveInteger(value.quantity, `lines.${index}.quantity`);
    const unitAmount = nonNegativeInteger(value.unitAmount ?? value.unit_amount, `lines.${index}.unitAmount`);
    const currency = currencyValue(value.currency ?? orderCurrency, `lines.${index}.currency`);
    return stripUndefined({
        title: requiredText(value.title, `lines.${index}.title`, 300),
        sku: optionalTextValue(value.sku, `lines.${index}.sku`, 120),
        quantity,
        unit_amount: unitAmount,
        line_total: unitAmount * quantity,
        currency,
        product_snapshot: objectValue(value.productSnapshot ?? value.product_snapshot, `lines.${index}.productSnapshot`),
        variant_snapshot: objectValue(value.variantSnapshot ?? value.variant_snapshot, `lines.${index}.variantSnapshot`),
        metadata: objectValue(value.metadata, `lines.${index}.metadata`),
    });
}

async function insertOrder(values: JsonRecord): Promise<OrderRow> {
    const response = await rest(`orders?select=${orderSelect}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(values),
    });
    if (!response.ok) throw await restError(response);
    return firstRow<OrderRow>(await response.json());
}

async function insertOrderLines(orderId: string, lines: JsonRecord[]): Promise<OrderLineRow[]> {
    const values = lines.map(line => ({ order_id: orderId, ...line }));
    const response = await rest(`order_lines?select=${lineSelect}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(values),
    });
    if (!response.ok) throw await restError(response);
    return await response.json() as OrderLineRow[];
}

async function patchOrderRow(id: string, patch: JsonRecord): Promise<OrderRow> {
    const response = await rest(`orders?id=eq.${encodeURIComponent(id)}&select=${orderSelect}`, {
        method: "PATCH",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(patch),
    });
    if (!response.ok) throw await restError(response);
    return firstRow<OrderRow>(await response.json());
}

async function insertEvent(orderId: string, values: JsonRecord): Promise<void> {
    const response = await rest("order_events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order_id: orderId, ...stripUndefined(values) }),
    });
    if (!response.ok) throw await restError(response);
}

async function getOrderRow(id: string): Promise<OrderRow | null> {
    const response = await rest(`orders?id=eq.${encodeURIComponent(id)}&select=${orderSelect}&limit=1`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as OrderRow[];
    return rows[0] ?? null;
}

async function getOrderByNumber(orderNumber: string): Promise<OrderRow | null> {
    const response = await rest(`orders?order_number=eq.${encodeURIComponent(orderNumber)}&select=${orderSelect}&limit=1`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as OrderRow[];
    return rows[0] ?? null;
}

async function getOrderLines(orderId: string): Promise<OrderLineRow[]> {
    const query = new URLSearchParams();
    query.set("order_id", `eq.${orderId}`);
    query.set("select", lineSelect);
    query.set("order", "id.asc");
    const response = await rest(`order_lines?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    return await response.json() as OrderLineRow[];
}

async function getOrderEvents(orderId: string): Promise<OrderEventRow[]> {
    const query = new URLSearchParams();
    query.set("order_id", `eq.${orderId}`);
    query.set("select", eventSelect);
    query.set("order", "created_at.desc,id.desc");
    query.set("limit", "100");
    const response = await rest(`order_events?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    return await response.json() as OrderEventRow[];
}

async function publicOrderDetail(
    order: OrderRow,
    lines?: OrderLineRow[],
): Promise<JsonRecord> {
    const [nextLines, events] = await Promise.all([
        lines ? Promise.resolve(lines) : getOrderLines(order.id),
        getOrderEvents(order.id),
    ]);
    return {
        ...publicOrderSummary(order),
        buyerEmail: order.buyer_email,
        buyerName: order.buyer_name,
        buyerPhone: order.buyer_phone,
        billingAddress: order.billing_address,
        shippingAddress: order.shipping_address,
        metadata: order.metadata,
        placedAt: order.placed_at,
        cancelledAt: order.cancelled_at,
        completedAt: order.completed_at,
        lines: nextLines.map(publicLine),
        events: events.map(publicEvent),
    };
}

function publicOrderSummary(row: OrderRow): JsonRecord {
    return {
        id: row.id,
        orderNumber: row.order_number,
        sellerUserId: row.seller_cms_user_id,
        buyerUserId: row.buyer_cms_user_id,
        buyerEmail: row.buyer_email,
        buyerName: row.buyer_name,
        status: row.status,
        currency: row.currency,
        subtotalAmount: row.subtotal_amount,
        totalAmount: row.total_amount,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function publicLine(row: OrderLineRow): JsonRecord {
    return {
        id: String(row.id),
        title: row.title,
        sku: row.sku,
        quantity: row.quantity,
        unitAmount: row.unit_amount,
        lineTotal: row.line_total,
        currency: row.currency,
        productSnapshot: row.product_snapshot,
        variantSnapshot: row.variant_snapshot,
        metadata: row.metadata,
        createdAt: row.created_at,
    };
}

function publicEvent(row: OrderEventRow): JsonRecord {
    return {
        id: String(row.id),
        orderId: row.order_id,
        eventType: row.event_type,
        actorUserId: row.actor_user_id,
        message: row.message,
        data: row.data,
        createdAt: row.created_at,
    };
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-orders";
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
    const expected = requiredEnv("CMS_ORDERS_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, expected)) throw new HttpError(401, "invalid CMS API key");

    const requireUser = options.requireUser ?? true;
    const userId = request.headers.get("x-cms-user-id")?.trim() || "";
    if (requireUser && !userId) throw new HttpError(401, "missing CMS user id");
    if (userId.length > 200) throw new HttpError(400, "CMS user id is too long");

    return { userId };
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", ordersSchema);
    if (init.method && init.method !== "GET") headers.set("content-profile", ordersSchema);

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

function arrayField(body: JsonRecord, name: string): unknown[] {
    const value = body[name];
    if (!Array.isArray(value)) throw new HttpError(400, `${name} must be an array`);
    return value;
}

function requiredQueryText(request: Request, name: string, maxLength: number): string {
    return requiredText(new URL(request.url).searchParams.get(name), name, maxLength);
}

function requiredText(value: unknown, name: string, maxLength: number): string {
    const text = textValue(value);
    if (!text) throw new HttpError(400, `${name} is required`);
    if (text.length > maxLength) throw new HttpError(400, `${name} is too long`);
    return text;
}

function optionalText(value: string | null, maxLength: number): string | undefined {
    return optionalTextValue(value, "value", maxLength);
}

function optionalTextValue(value: unknown, name: string, maxLength: number): string | undefined {
    const text = textValue(value);
    if (!text) return undefined;
    if (text.length > maxLength) throw new HttpError(400, `${name} is too long`);
    return text;
}

function textValue(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return "";
}

function optionalEmail(value: unknown, name: string): string | undefined {
    const email = optionalTextValue(value, name, 320)?.toLowerCase();
    if (!email) return undefined;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, `${name} is invalid`);
    return email;
}

function objectValue(value: unknown, name: string): JsonRecord {
    if (value === undefined || value === null || value === "") return {};
    if (!isRecord(value)) throw new HttpError(400, `${name} must be an object`);
    return value;
}

function optionalInteger(value: unknown, name: string): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    return integerValue(value, name);
}

function positiveInteger(value: unknown, name: string): number {
    const number = integerValue(value, name);
    if (number < 1) throw new HttpError(400, `${name} must be positive`);
    return number;
}

function nonNegativeInteger(value: unknown, name: string): number {
    const number = integerValue(value, name);
    if (number < 0) throw new HttpError(400, `${name} must be non-negative`);
    return number;
}

function integerValue(value: unknown, name: string): number {
    const text = textValue(value);
    const number = Number(text);
    if (!Number.isInteger(number)) throw new HttpError(400, `${name} must be an integer`);
    return number;
}

function numberRecordValue(value: JsonRecord, key: string): number {
    const number = value[key];
    if (typeof number !== "number") throw new HttpError(500, `invalid ${key}`);
    return number;
}

function currencyValue(value: unknown, name: string): string {
    const currency = requiredText(value, name, 3).toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) throw new HttpError(400, `${name} must be a 3-letter currency code`);
    return currency;
}

function orderStatusValue(value: unknown, name: string): OrderStatus {
    const status = requiredText(value, name, 40);
    if (!["draft", "placed", "cancelled", "completed", "archived"].includes(status)) {
        throw new HttpError(400, `${name} is invalid`);
    }
    return status as OrderStatus;
}

function optionalOrderStatus(value: string | null): OrderStatus | undefined {
    if (!value) return undefined;
    return orderStatusValue(value, "status");
}

function optionalSearch(value: string | null): string | undefined {
    const search = (value ?? "").trim();
    if (!search) return undefined;
    return search.slice(0, 120).replace(/[*,()%]/g, "");
}

function boundedLimit(value: string | null, fallback: number): number {
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

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
