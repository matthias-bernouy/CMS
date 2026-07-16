type JsonRecord = Record<string, unknown>;

type ProposalRow = {
    id: number;
    public_id: string;
    commerce_offer_id: number;
    commerce_offer_slug: string;
    commerce_offer_title: string;
    seller_cms_user_id: string;
    seller_display_name: string;
    buyer_cms_user_id: string;
    reference_amount: number;
    minimum_amount: number;
    maximum_amount: number;
    proposed_amount: number;
    currency: string;
    buyer_message: string | null;
    decision_message: string | null;
    status: string;
    version: number;
    expires_at: string;
    accepted_at: string | null;
    rejected_at: string | null;
    withdrawn_at: string | null;
    created_at: string;
    updated_at: string;
};

type SettingsRow = {
    id: string;
    minimum_ratio_bps: number;
    maximum_ratio_bps: number;
    proposal_ttl_hours: number;
    enabled: boolean;
    version: number;
    created_at: string;
    updated_at: string;
};

type CommerceContext = {
    offerId: number;
    offerSlug: string;
    offerTitle: string;
    sellerCmsUserId: string;
    sellerDisplayName: string;
    referenceAmount: number;
    currency: string;
};

class HttpError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

const schema = "commerce_negotiation";
const proposalSelect = [
    "id", "public_id", "commerce_offer_id", "commerce_offer_slug", "commerce_offer_title",
    "seller_cms_user_id", "seller_display_name", "buyer_cms_user_id",
    "reference_amount", "minimum_amount", "maximum_amount", "proposed_amount", "currency",
    "buyer_message", "decision_message", "status", "version", "expires_at",
    "accepted_at", "rejected_at", "withdrawn_at", "created_at", "updated_at",
].join(",");
const settingsSelect = "id,minimum_ratio_bps,maximum_ratio_bps,proposal_ttl_hours,enabled,version,created_at,updated_at";
const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-cms-user-id, x-cms-admin-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();
        requireCmsRequest(request);
        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health());
        if (route === "/policy") return await withMethod(request, "GET", () => getPolicy(request));
        if (route === "/proposals") {
            if (request.method === "GET") return listMyProposals(request);
            if (request.method === "POST") return createMyProposal(request);
            return methodNotAllowed("GET, POST, OPTIONS");
        }
        if (route === "/proposal") return await withMethod(request, "GET", () => getMyProposal(request));
        if (route === "/proposal/respond") return await withMethod(request, "POST", () => respondToProposal(request));
        if (route === "/proposal/withdraw") return await withMethod(request, "POST", () => withdrawMyProposal(request));
        if (route === "/admin/proposals") return await withMethod(request, "GET", () => listAdminProposals(request));
        if (route === "/admin/proposal") return await withMethod(request, "GET", () => getAdminProposal(request));
        if (route === "/admin/proposal/cancel") return await withMethod(request, "POST", () => cancelAdminProposal(request));
        if (route === "/admin/settings") {
            if (request.method === "GET") return getSettings();
            if (request.method === "POST") return updateSettings(request);
            return methodNotAllowed("GET, POST, OPTIONS");
        }
        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function health(): Promise<Response> {
    const settings = await settingsRow();
    return json({ ok: true, enabled: settings.enabled });
}

async function getPolicy(request: Request): Promise<Response> {
    const buyerUserId = requireUserId(request);
    const context = commerceContext(Object.fromEntries(new URL(request.url).searchParams));
    const settings = await settingsRow();
    const bounds = priceBounds(context.referenceAmount, settings);
    const canPropose = context.sellerCmsUserId !== buyerUserId;
    return json({
        enabled: settings.enabled,
        canPropose,
        ...(canPropose ? {} : { ineligibilityReason: "own_offer" }),
        offerId: context.offerId,
        referenceAmount: context.referenceAmount,
        minimumAmount: bounds.minimumAmount,
        maximumAmount: bounds.maximumAmount,
        currency: context.currency,
        expiresAfterHours: settings.proposal_ttl_hours,
    });
}

async function createMyProposal(request: Request): Promise<Response> {
    const buyerUserId = requireUserId(request);
    const body = await readJsonObject(request);
    const amount = requiredInteger(body, "amount");
    const message = optionalText(body, "message", 2000);
    const context = commerceContext(body);
    if (context.sellerCmsUserId === buyerUserId) throw new HttpError(403, "sellers cannot negotiate with themselves");
    const row = await rpcRow<ProposalRow>("create_proposal", {
        p_offer_id: context.offerId,
        p_offer_slug: context.offerSlug,
        p_offer_title: context.offerTitle,
        p_seller_cms_user_id: context.sellerCmsUserId,
        p_seller_display_name: context.sellerDisplayName,
        p_buyer_cms_user_id: buyerUserId,
        p_reference_amount: context.referenceAmount,
        p_proposed_amount: amount,
        p_currency: context.currency,
        p_buyer_message: message,
    });
    return json(publicProposal(row, buyerUserId), 201);
}

async function listMyProposals(request: Request): Promise<Response> {
    const userId = requireUserId(request);
    await expirePending();
    const url = new URL(request.url);
    const role = optionalEnum(url.searchParams.get("role"), "role", ["buyer", "seller"]);
    const status = optionalEnum(url.searchParams.get("status"), "status", proposalStatuses);
    const offerId = optionalPositiveInteger(url.searchParams.get("offerId"), "offerId");
    const limit = boundedLimit(url.searchParams.get("limit"));
    const offset = boundedOffset(url.searchParams.get("offset"));
    const query = new URLSearchParams({
        select: proposalSelect,
        order: "created_at.desc",
        limit: String(limit),
        offset: String(offset),
    });
    if (role === "buyer") query.set("buyer_cms_user_id", `eq.${userId}`);
    else if (role === "seller") query.set("seller_cms_user_id", `eq.${userId}`);
    else query.set("or", `(buyer_cms_user_id.eq.${postgrestValue(userId)},seller_cms_user_id.eq.${postgrestValue(userId)})`);
    if (status) query.set("status", `eq.${status}`);
    if (offerId) query.set("commerce_offer_id", `eq.${offerId}`);
    const response = await rest(`proposals?${query}`, { method: "GET", headers: { prefer: "count=exact" } });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ProposalRow[];
    return json({
        items: rows.map(row => publicProposal(row, userId)),
        total: countFromContentRange(response.headers.get("content-range")) ?? rows.length,
    });
}

async function getMyProposal(request: Request): Promise<Response> {
    const userId = requireUserId(request);
    await expirePending();
    const row = await proposalByRequest(request);
    if (!row || (row.buyer_cms_user_id !== userId && row.seller_cms_user_id !== userId)) {
        throw new HttpError(404, "proposal not found");
    }
    return json(await proposalDetail(row, userId));
}

async function respondToProposal(request: Request): Promise<Response> {
    const sellerUserId = requireUserId(request);
    const body = await readJsonObject(request);
    const row = await rpcRow<ProposalRow>("decide_proposal", {
        p_proposal_id: requiredInteger(body, "id"),
        p_seller_cms_user_id: sellerUserId,
        p_action: requiredEnum(body, "action", ["accept", "reject"]),
        p_expected_version: requiredInteger(body, "expectedVersion"),
        p_message: optionalText(body, "message", 2000),
    });
    return json(publicProposal(row, sellerUserId));
}

async function withdrawMyProposal(request: Request): Promise<Response> {
    const buyerUserId = requireUserId(request);
    const body = await readJsonObject(request);
    const row = await rpcRow<ProposalRow>("withdraw_proposal", {
        p_proposal_id: requiredInteger(body, "id"),
        p_buyer_cms_user_id: buyerUserId,
        p_expected_version: requiredInteger(body, "expectedVersion"),
    });
    return json(publicProposal(row, buyerUserId));
}

async function listAdminProposals(request: Request): Promise<Response> {
    await expirePending();
    const url = new URL(request.url);
    const q = optionalSearch(url.searchParams.get("q"));
    const status = optionalEnum(url.searchParams.get("status"), "status", proposalStatuses);
    const limit = boundedLimit(url.searchParams.get("limit"));
    const offset = boundedOffset(url.searchParams.get("offset"));
    const query = new URLSearchParams({
        select: proposalSelect,
        order: "created_at.desc",
        limit: String(limit),
        offset: String(offset),
    });
    if (q) {
        const pattern = postgrestValue(`*${q}*`);
        query.set("or", `(commerce_offer_title.ilike.${pattern},commerce_offer_slug.ilike.${pattern},buyer_cms_user_id.ilike.${pattern},seller_cms_user_id.ilike.${pattern})`);
    }
    if (status) query.set("status", `eq.${status}`);
    const response = await rest(`proposals?${query}`, { method: "GET", headers: { prefer: "count=exact" } });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ProposalRow[];
    return json({ items: rows.map(row => publicProposal(row)), total: countFromContentRange(response.headers.get("content-range")) ?? rows.length });
}

async function getAdminProposal(request: Request): Promise<Response> {
    await expirePending();
    const row = await proposalByRequest(request);
    if (!row) throw new HttpError(404, "proposal not found");
    return json(await proposalDetail(row));
}

async function cancelAdminProposal(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const row = await rpcRow<ProposalRow>("moderate_proposal", {
        p_proposal_id: requiredInteger(body, "id"),
        p_admin_id: request.headers.get("x-cms-admin-id")?.trim() || "cms-admin",
        p_expected_version: requiredInteger(body, "expectedVersion"),
        p_reason: optionalText(body, "reason", 2000),
    });
    return json(publicProposal(row));
}

async function getSettings(): Promise<Response> {
    return json(publicSettings(await settingsRow()));
}

async function updateSettings(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const expectedVersion = requiredInteger(body, "expectedVersion");
    const patch: JsonRecord = {};
    if (Object.hasOwn(body, "minimumPercent")) patch.minimum_ratio_bps = percentToBps(requiredNumber(body, "minimumPercent"), "minimumPercent");
    if (Object.hasOwn(body, "maximumPercent")) patch.maximum_ratio_bps = percentToBps(requiredNumber(body, "maximumPercent"), "maximumPercent");
    if (Object.hasOwn(body, "proposalTtlHours")) patch.proposal_ttl_hours = requiredInteger(body, "proposalTtlHours");
    if (Object.hasOwn(body, "enabled")) patch.enabled = requiredBoolean(body, "enabled");
    const query = new URLSearchParams({ id: "eq.default", version: `eq.${expectedVersion}`, select: settingsSelect });
    const response = await rest(`settings?${query}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify(patch),
    });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as SettingsRow[];
    if (!rows[0]) throw new HttpError(409, "stale settings version");
    return json(publicSettings(rows[0]));
}

function commerceContext(value: JsonRecord): CommerceContext {
    if (value.publicationStatus !== "active" || value.availability !== "available") {
        throw new HttpError(409, "offer is not available for negotiation");
    }
    return {
        offerId: safePositiveInteger(value.offerId, "offer id"),
        offerSlug: requiredRecordText(value, "offerSlug"),
        offerTitle: requiredRecordText(value, "offerTitle"),
        sellerCmsUserId: requiredRecordText(value, "sellerCmsUserId"),
        sellerDisplayName: typeof value.sellerDisplayName === "string" && value.sellerDisplayName.trim()
            ? value.sellerDisplayName.trim()
            : "Seller",
        referenceAmount: safePositiveInteger(value.referenceAmount, "offer price"),
        currency: normalizeCurrency(value.currency),
    };
}

async function settingsRow(): Promise<SettingsRow> {
    const query = new URLSearchParams({ select: settingsSelect, id: "eq.default", limit: "1" });
    const response = await rest(`settings?${query}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    return firstRow<SettingsRow>(await response.json());
}

async function proposalByRequest(request: Request): Promise<ProposalRow | null> {
    const url = new URL(request.url);
    const id = optionalPositiveInteger(url.searchParams.get("id"), "id");
    const publicId = optionalTextValue(url.searchParams.get("publicId"), 80);
    if (!id && !publicId) throw new HttpError(400, "id or publicId is required");
    const query = new URLSearchParams({ select: proposalSelect, limit: "1" });
    if (id) query.set("id", `eq.${id}`);
    else query.set("public_id", `eq.${publicId}`);
    const response = await rest(`proposals?${query}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ProposalRow[];
    return rows[0] ?? null;
}

async function proposalDetail(row: ProposalRow, viewerId?: string): Promise<JsonRecord> {
    const query = new URLSearchParams({
        select: "id,event_type,actor_kind,actor_id,previous_status,next_status,data,created_at",
        proposal_id: `eq.${row.id}`,
        order: "created_at.asc",
    });
    const response = await rest(`proposal_events?${query}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    return { ...publicProposal(row, viewerId), events: (await response.json() as JsonRecord[]).map(publicEvent) };
}

async function expirePending(): Promise<void> {
    await rpc("expire_pending_proposals", {});
}

async function rpcRow<T>(name: string, body: JsonRecord): Promise<T> {
    const response = await rpc(name, body);
    const value = await response.json();
    if (!isRecord(value)) throw new HttpError(502, `${name} returned an invalid row`);
    return value as T;
}

async function rpc(name: string, body: JsonRecord): Promise<Response> {
    const response = await rest(`rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw await restError(response);
    return response;
}

function publicProposal(row: ProposalRow, viewerId?: string): JsonRecord {
    return {
        id: row.id,
        publicId: row.public_id,
        offerId: row.commerce_offer_id,
        offerSlug: row.commerce_offer_slug,
        offerTitle: row.commerce_offer_title,
        sellerUserId: row.seller_cms_user_id,
        sellerDisplayName: row.seller_display_name,
        buyerUserId: row.buyer_cms_user_id,
        viewerRole: viewerId === row.buyer_cms_user_id ? "buyer" : viewerId === row.seller_cms_user_id ? "seller" : "admin",
        referenceAmount: row.reference_amount,
        minimumAmount: row.minimum_amount,
        maximumAmount: row.maximum_amount,
        proposedAmount: row.proposed_amount,
        currency: row.currency,
        buyerMessage: row.buyer_message,
        decisionMessage: row.decision_message,
        status: row.status,
        version: row.version,
        expiresAt: row.expires_at,
        acceptedAt: row.accepted_at,
        rejectedAt: row.rejected_at,
        withdrawnAt: row.withdrawn_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function publicEvent(row: JsonRecord): JsonRecord {
    return {
        id: row.id,
        eventType: row.event_type,
        actorKind: row.actor_kind,
        actorId: row.actor_id,
        previousStatus: row.previous_status,
        nextStatus: row.next_status,
        data: row.data,
        createdAt: row.created_at,
    };
}

function publicSettings(row: SettingsRow): JsonRecord {
    return {
        minimumPercent: row.minimum_ratio_bps / 100,
        maximumPercent: row.maximum_ratio_bps / 100,
        proposalTtlHours: row.proposal_ttl_hours,
        enabled: row.enabled,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function priceBounds(referenceAmount: number, settings: SettingsRow): { minimumAmount: number; maximumAmount: number } {
    return {
        minimumAmount: Math.ceil(referenceAmount * settings.minimum_ratio_bps / 10000),
        maximumAmount: Math.floor(referenceAmount * settings.maximum_ratio_bps / 10000),
    };
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-commerce-negotiation";
    const index = pathname.indexOf(marker);
    if (index === -1) return pathname || "/";
    return pathname.slice(index + marker.length) || "/";
}

function requireCmsRequest(request: Request): void {
    const expected = requiredEnv("CMS_NEGOTIATION_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token || !safeEqual(token, expected)) throw new HttpError(401, "invalid CMS API key");
}

function requireUserId(request: Request): string {
    const userId = request.headers.get("x-cms-user-id")?.trim() ?? "";
    if (!userId) throw new HttpError(401, "CMS user identity required");
    if (userId.length > 512) throw new HttpError(400, "CMS user identity is too long");
    return userId;
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("apikey", requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    headers.set("authorization", `Bearer ${requiredEnv("SUPABASE_SERVICE_ROLE_KEY")}`);
    headers.set("accept-profile", schema);
    if (init.method && init.method !== "GET" && init.method !== "HEAD") headers.set("content-profile", schema);
    return fetch(`${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`, { ...init, headers });
}

async function restError(response: Response): Promise<HttpError> {
    const body = await response.json().catch(() => null);
    const message = isRecord(body) && typeof body.message === "string" ? body.message : `database request failed (${response.status})`;
    const match = /^(validation|conflict|forbidden|unauthorized|not_found):\s*(.+)$/i.exec(message);
    if (match) {
        const status = match[1]!.toLowerCase() === "validation" ? 400
            : match[1]!.toLowerCase() === "conflict" ? 409
            : match[1]!.toLowerCase() === "forbidden" ? 403
            : match[1]!.toLowerCase() === "unauthorized" ? 401
            : 404;
        return new HttpError(status, match[2]!);
    }
    return new HttpError(response.status >= 400 && response.status < 500 ? response.status : 502, message);
}

async function readJsonObject(request: Request): Promise<JsonRecord> {
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) throw new HttpError(400, "JSON object body required");
    return body;
}

function requiredInteger(body: JsonRecord, name: string): number {
    const value = body[name];
    const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
    if (!Number.isSafeInteger(parsed)) throw new HttpError(400, `${name} must be an integer`);
    return parsed as number;
}

function requiredNumber(body: JsonRecord, name: string): number {
    const value = body[name];
    const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) throw new HttpError(400, `${name} must be a number`);
    return parsed;
}

function requiredBoolean(body: JsonRecord, name: string): boolean {
    if (typeof body[name] !== "boolean") throw new HttpError(400, `${name} must be a boolean`);
    return body[name] as boolean;
}

function requiredEnum(body: JsonRecord, name: string, allowed: readonly string[]): string {
    const value = optionalText(body, name, 64);
    if (!value || !allowed.includes(value)) throw new HttpError(400, `${name} must be ${allowed.join(" or ")}`);
    return value;
}

function optionalText(body: JsonRecord, name: string, max: number): string | null {
    const value = body[name];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${name} must be text`);
    if (value.trim().length > max) throw new HttpError(400, `${name} is too long`);
    return value.trim();
}

function optionalTextValue(value: string | null, max: number): string | null {
    const text = value?.trim() ?? "";
    if (!text) return null;
    if (text.length > max) throw new HttpError(400, "query value is too long");
    return text;
}

function requiredQueryInteger(request: Request, name: string): number {
    const value = optionalPositiveInteger(new URL(request.url).searchParams.get(name), name);
    if (!value) throw new HttpError(400, `${name} is required`);
    return value;
}

function optionalPositiveInteger(value: string | null, name: string): number | null {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new HttpError(400, `${name} must be a positive integer`);
    return parsed;
}

function safePositiveInteger(value: unknown, name: string): number {
    const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || Number(parsed) <= 0) throw new HttpError(409, `${name} is unavailable`);
    return Number(parsed);
}

function requiredRecordText(record: JsonRecord, name: string): string {
    const value = record[name];
    if (typeof value !== "string" || !value.trim()) throw new HttpError(502, `Commerce ${name} is missing`);
    return value.trim();
}

function normalizeCurrency(value: unknown): string {
    if (typeof value !== "string" || !/^[a-z]{3}$/i.test(value)) throw new HttpError(502, "Commerce currency is invalid");
    return value.toLowerCase();
}

function optionalEnum(value: string | null, name: string, allowed: readonly string[]): string | null {
    if (!value) return null;
    if (!allowed.includes(value)) throw new HttpError(400, `${name} is invalid`);
    return value;
}

function optionalSearch(value: string | null): string | null {
    const q = value?.trim() ?? "";
    if (!q) return null;
    if (q.length > 120) throw new HttpError(400, "q is too long");
    return q.replace(/[,*()]/g, " ").trim() || null;
}

function boundedLimit(value: string | null): number {
    if (!value) return 50;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) throw new HttpError(400, "limit must be between 1 and 200");
    return parsed;
}

function boundedOffset(value: string | null): number {
    if (!value) return 0;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1000000) throw new HttpError(400, "offset is invalid");
    return parsed;
}

function percentToBps(percent: number, name: string): number {
    const bps = Math.round(percent * 100);
    if (Math.abs(percent * 100 - bps) > 0.000001) throw new HttpError(400, `${name} supports at most two decimals`);
    return bps;
}

function postgrestValue(value: string): string {
    return `"${value.replace(/["\\]/g, character => `\\${character}`)}"`;
}

function countFromContentRange(value: string | null): number | null {
    const total = value?.split("/")[1];
    return total && /^\d+$/.test(total) ? Number(total) : null;
}

function firstRow<T>(value: unknown): T {
    if (!Array.isArray(value) || !value[0]) throw new HttpError(502, "database returned no row");
    return value[0] as T;
}

function requiredEnv(name: string): string {
    const value = Deno.env.get(name)?.trim() ?? "";
    if (!value) throw new HttpError(500, `${name} is not configured`);
    return value;
}

function safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let result = 0;
    for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return result === 0;
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

function optionsResponse(): Response {
    return new Response(null, { status: 204, headers: corsHeaders });
}

function methodNotAllowed(allow: string): Response {
    return new Response("Method Not Allowed", { status: 405, headers: { ...corsHeaders, allow } });
}

async function withMethod(request: Request, method: string, handler: () => Promise<Response>): Promise<Response> {
    if (request.method !== method) return methodNotAllowed(`${method}, OPTIONS`);
    return handler();
}

function handleError(error: unknown): Response {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "internal error" }, 500);
}

const proposalStatuses = ["pending", "accepted", "rejected", "withdrawn", "expired", "superseded", "canceled"] as const;
