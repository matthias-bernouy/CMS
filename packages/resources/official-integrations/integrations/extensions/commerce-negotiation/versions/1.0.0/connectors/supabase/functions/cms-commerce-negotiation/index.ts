type JsonRecord = Record<string, unknown>;

type ProposalRow = {
    id: number;
    public_id: string;
    commerce_offer_id: number;
    commerce_offer_slug: string;
    commerce_offer_title: string;
    offer_main_image_media_id: number | null;
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
    commerce_agreement_id: string | null;
    agreement_version: number | null;
    checkout_expires_at: string | null;
    checkout_status: "active" | "consumed" | "expired" | "canceled" | null;
    commerce_order_public_id: string | null;
    agreement_consumed_at: string | null;
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
    accepted_checkout_ttl_hours: number;
    enabled: boolean;
    version: number;
    created_at: string;
    updated_at: string;
};

type CommerceContext = {
    offerId: number;
    offerSlug: string;
    offerTitle: string;
    offerMainImageMediaId: number | null;
    sellerCmsUserId: string;
    sellerDisplayName: string;
    referenceAmount: number;
    currency: string;
    wholeUnitPrices: boolean;
};

class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

const schema = "commerce_negotiation";
const settingsSelect =
    "id,minimum_ratio_bps,maximum_ratio_bps,proposal_ttl_hours,accepted_checkout_ttl_hours,enabled,version,created_at,updated_at";
const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-cms-user-id, x-cms-admin-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") {
            return optionsResponse();
        }
        requireCmsRequest(request);
        const route = routePath(request);
        if (route === "/health") {
            return await withMethod(request, "GET", () => health());
        }
        if (route === "/policy") {
            return await withMethod(request, "GET", () => getPolicy(request));
        }
        if (route === "/proposals") {
            if (request.method === "GET") {
                return await listMyProposals(request);
            }
            if (request.method === "POST") {
                return await createMyProposal(request);
            }
            return methodNotAllowed("GET, POST, OPTIONS");
        }
        if (route === "/proposal") {
            return await withMethod(request, "GET", () => getMyProposal(request));
        }
        if (route === "/proposal/respond") {
            return await withMethod(request, "POST", () => respondToProposal(request));
        }
        if (route === "/proposal/withdraw") {
            return await withMethod(request, "POST", () => withdrawMyProposal(request));
        }
        if (route === "/admin/proposals") {
            return await withMethod(request, "GET", () => listAdminProposals(request));
        }
        if (route === "/admin/proposal") {
            return await withMethod(request, "GET", () => getAdminProposal(request));
        }
        if (route === "/admin/proposal/cancel") {
            return await withMethod(request, "POST", () => cancelAdminProposal(request));
        }
        if (route === "/admin/settings") {
            if (request.method === "GET") {
                return await getSettings();
            }
            if (request.method === "POST") {
                return await updateSettings(request);
            }
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
    await rpcValue("expire_pending_proposals", {});
    const settings = await settingsRow();
    const bounds = priceBounds(context.referenceAmount, settings, context.wholeUnitPrices);
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
        wholeUnitPrices: context.wholeUnitPrices,
        expiresAfterHours: settings.proposal_ttl_hours,
    });
}

async function createMyProposal(request: Request): Promise<Response> {
    const buyerUserId = requireUserId(request);
    const body = await readJsonObject(request);
    const amount = requiredInteger(body, "amount");
    const message = optionalText(body, "message", 2000);
    const context = commerceContext(body);
    if (context.sellerCmsUserId === buyerUserId) {
        throw new HttpError(403, "sellers cannot negotiate with themselves");
    }
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
        p_offer_main_image_media_id: context.offerMainImageMediaId,
    });
    return json(publicProposal(row, buyerUserId), 201);
}

async function listMyProposals(request: Request): Promise<Response> {
    const userId = requireUserId(request);
    const url = new URL(request.url);
    const role = optionalEnum(url.searchParams.get("role"), "role", ["buyer", "seller"]);
    const status = optionalEnum(url.searchParams.get("status"), "status", proposalStatuses);
    const offerId = optionalPositiveInteger(url.searchParams.get("offerId"), "offerId");
    const limit = boundedLimit(url.searchParams.get("limit"));
    const offset = boundedOffset(url.searchParams.get("offset"));
    const result = await proposalList("list_participant_proposals", {
        p_user_id: userId,
        p_role: role,
        p_status: status,
        p_offer_id: offerId,
        p_limit: limit,
        p_offset: offset,
    });
    return json({
        items: result.items.map((row) => publicProposal(row, userId)),
        total: result.total,
    });
}

async function getMyProposal(request: Request): Promise<Response> {
    const userId = requireUserId(request);
    const detail = await proposalDetail("get_participant_proposal_detail", {
        p_user_id: userId,
        ...proposalLookup(request),
    });
    if (!detail) {
        throw new HttpError(404, "proposal not found");
    }
    return json({ ...publicProposal(detail.proposal, userId), events: detail.events.map(publicEvent) });
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
    const url = new URL(request.url);
    const q = optionalSearch(url.searchParams.get("q"));
    const status = optionalEnum(url.searchParams.get("status"), "status", proposalStatuses);
    const limit = boundedLimit(url.searchParams.get("limit"));
    const offset = boundedOffset(url.searchParams.get("offset"));
    const result = await proposalList("list_admin_proposals", {
        p_query: q,
        p_status: status,
        p_limit: limit,
        p_offset: offset,
    });
    return json({ items: result.items.map((row) => publicProposal(row)), total: result.total });
}

async function getAdminProposal(request: Request): Promise<Response> {
    const detail = await proposalDetail("get_admin_proposal_detail", proposalLookup(request));
    if (!detail) {
        throw new HttpError(404, "proposal not found");
    }
    return json({ ...publicProposal(detail.proposal), events: detail.events.map(publicEvent) });
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
    if (Object.hasOwn(body, "minimumPercent")) {
        patch.minimum_ratio_bps = percentToBps(requiredNumber(body, "minimumPercent"), "minimumPercent");
    }
    if (Object.hasOwn(body, "maximumPercent")) {
        patch.maximum_ratio_bps = percentToBps(requiredNumber(body, "maximumPercent"), "maximumPercent");
    }
    if (Object.hasOwn(body, "proposalTtlHours")) {
        patch.proposal_ttl_hours = requiredInteger(body, "proposalTtlHours");
    }
    if (Object.hasOwn(body, "acceptedCheckoutTtlHours")) {
        patch.accepted_checkout_ttl_hours = requiredInteger(body, "acceptedCheckoutTtlHours");
    }
    if (Object.hasOwn(body, "enabled")) {
        patch.enabled = requiredBoolean(body, "enabled");
    }
    const query = new URLSearchParams({ id: "eq.default", version: `eq.${expectedVersion}`, select: settingsSelect });
    const response = await rest(`settings?${query}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify(patch),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as SettingsRow[];
    if (!rows[0]) {
        throw new HttpError(409, "stale settings version");
    }
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
        offerMainImageMediaId: optionalSafePositiveInteger(value.offerMainImageMediaId, "offer main image media id"),
        sellerCmsUserId: requiredRecordText(value, "sellerCmsUserId"),
        sellerDisplayName:
            typeof value.sellerDisplayName === "string" && value.sellerDisplayName.trim()
                ? value.sellerDisplayName.trim()
                : "Seller",
        referenceAmount: safePositiveInteger(value.referenceAmount, "offer price"),
        currency: normalizeCurrency(value.currency),
        wholeUnitPrices: requiredTransportBoolean(value, "wholeUnitPrices"),
    };
}

async function settingsRow(): Promise<SettingsRow> {
    const query = new URLSearchParams({ select: settingsSelect, id: "eq.default", limit: "1" });
    const response = await rest(`settings?${query}`, { method: "GET" });
    if (!response.ok) {
        throw await restError(response);
    }
    return firstRow<SettingsRow>(await response.json());
}

function proposalLookup(request: Request): { p_id: number | null; p_public_id: string | null } {
    const url = new URL(request.url);
    const id = optionalPositiveInteger(url.searchParams.get("id"), "id");
    const publicId = optionalTextValue(url.searchParams.get("publicId"), 80);
    if (!id && !publicId) {
        throw new HttpError(400, "id or publicId is required");
    }
    return { p_id: id, p_public_id: id ? null : publicId };
}

async function proposalList(name: string, body: JsonRecord): Promise<{ items: ProposalRow[]; total: number }> {
    const value = await rpcValue(name, body);
    if (
        !isRecord(value) ||
        !Array.isArray(value.items) ||
        !value.items.every(isRecord) ||
        !Number.isSafeInteger(value.total) ||
        Number(value.total) < 0
    ) {
        throw new HttpError(502, `${name} returned an invalid list`);
    }
    return { items: value.items as ProposalRow[], total: Number(value.total) };
}

async function proposalDetail(
    name: string,
    body: JsonRecord,
): Promise<{ proposal: ProposalRow; events: JsonRecord[] } | null> {
    const value = await rpcValue(name, body);
    if (value === null) {
        return null;
    }
    if (
        !isRecord(value) ||
        !isRecord(value.proposal) ||
        !Array.isArray(value.events) ||
        !value.events.every(isRecord)
    ) {
        throw new HttpError(502, `${name} returned an invalid detail`);
    }
    return { proposal: value.proposal as ProposalRow, events: value.events };
}

async function rpcRow<T>(name: string, body: JsonRecord): Promise<T> {
    const value = await rpcValue(name, body);
    if (!isRecord(value)) {
        throw new HttpError(502, `${name} returned an invalid row`);
    }
    return value as T;
}

async function rpcValue(name: string, body: JsonRecord): Promise<unknown> {
    return await (await rpc(name, body)).json();
}

async function rpc(name: string, body: JsonRecord): Promise<Response> {
    const response = await rest(`rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    return response;
}

function publicProposal(row: ProposalRow, viewerId?: string): JsonRecord {
    return {
        id: row.id,
        publicId: row.public_id,
        offerId: row.commerce_offer_id,
        offerSlug: row.commerce_offer_slug,
        offerTitle: row.commerce_offer_title,
        offerMainImageMediaId: row.offer_main_image_media_id ?? null,
        sellerUserId: row.seller_cms_user_id,
        sellerDisplayName: row.seller_display_name,
        buyerUserId: row.buyer_cms_user_id,
        viewerRole:
            viewerId === row.buyer_cms_user_id ? "buyer" : viewerId === row.seller_cms_user_id ? "seller" : "admin",
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
        agreementId: row.commerce_agreement_id ?? null,
        agreementVersion: row.agreement_version ?? null,
        checkoutExpiresAt: row.checkout_expires_at ?? null,
        checkoutStatus: row.checkout_status ?? null,
        orderId: row.commerce_order_public_id ?? null,
        consumedAt: row.agreement_consumed_at ?? null,
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
        acceptedCheckoutTtlHours: row.accepted_checkout_ttl_hours,
        enabled: row.enabled,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function priceBounds(
    referenceAmount: number,
    settings: SettingsRow,
    wholeUnitPrices: boolean,
): { minimumAmount: number; maximumAmount: number } {
    const minimumAmount = Math.ceil((referenceAmount * settings.minimum_ratio_bps) / 10000);
    const maximumAmount = Math.floor((referenceAmount * settings.maximum_ratio_bps) / 10000);
    return wholeUnitPrices
        ? {
              minimumAmount: Math.ceil(minimumAmount / 100) * 100,
              maximumAmount: Math.floor(maximumAmount / 100) * 100,
          }
        : { minimumAmount, maximumAmount };
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-commerce-negotiation";
    const index = pathname.indexOf(marker);
    if (index === -1) {
        return pathname || "/";
    }
    return pathname.slice(index + marker.length) || "/";
}

function requireCmsRequest(request: Request): void {
    const expected = requiredEnv("CMS_NEGOTIATION_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token || !safeEqual(token, expected)) {
        throw new HttpError(401, "invalid CMS API key");
    }
}

function requireUserId(request: Request): string {
    const userId = request.headers.get("x-cms-user-id")?.trim() ?? "";
    if (!userId) {
        throw new HttpError(401, "CMS user identity required");
    }
    if (userId.length > 512) {
        throw new HttpError(400, "CMS user identity is too long");
    }
    return userId;
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("apikey", requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    headers.set("authorization", `Bearer ${requiredEnv("SUPABASE_SERVICE_ROLE_KEY")}`);
    headers.set("accept-profile", schema);
    if (init.method && init.method !== "GET" && init.method !== "HEAD") {
        headers.set("content-profile", schema);
    }
    return fetch(`${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`, { ...init, headers });
}

async function restError(response: Response): Promise<HttpError> {
    const body = await response.json().catch(() => null);
    const message =
        isRecord(body) && typeof body.message === "string"
            ? body.message
            : `database request failed (${response.status})`;
    const match = /^(validation|conflict|forbidden|unauthorized|not_found):\s*(.+)$/i.exec(message);
    if (match) {
        const status =
            match[1]!.toLowerCase() === "validation"
                ? 400
                : match[1]!.toLowerCase() === "conflict"
                  ? 409
                  : match[1]!.toLowerCase() === "forbidden"
                    ? 403
                    : match[1]!.toLowerCase() === "unauthorized"
                      ? 401
                      : 404;
        return new HttpError(status, match[2]!);
    }
    return new HttpError(response.status >= 400 && response.status < 500 ? response.status : 502, message);
}

async function readJsonObject(request: Request): Promise<JsonRecord> {
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
        throw new HttpError(400, "JSON object body required");
    }
    return body;
}

function requiredInteger(body: JsonRecord, name: string): number {
    const value = body[name];
    const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
    if (!Number.isSafeInteger(parsed)) {
        throw new HttpError(400, `${name} must be an integer`);
    }
    return parsed as number;
}

function requiredNumber(body: JsonRecord, name: string): number {
    const value = body[name];
    const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
        throw new HttpError(400, `${name} must be a number`);
    }
    return parsed;
}

function requiredBoolean(body: JsonRecord, name: string): boolean {
    if (typeof body[name] !== "boolean") {
        throw new HttpError(400, `${name} must be a boolean`);
    }
    return body[name] as boolean;
}

function requiredTransportBoolean(body: JsonRecord, name: string): boolean {
    if (body[name] === "true") {
        return true;
    }
    if (body[name] === "false") {
        return false;
    }
    return requiredBoolean(body, name);
}

function requiredEnum(body: JsonRecord, name: string, allowed: readonly string[]): string {
    const value = optionalText(body, name, 64);
    if (!value || !allowed.includes(value)) {
        throw new HttpError(400, `${name} must be ${allowed.join(" or ")}`);
    }
    return value;
}

function optionalText(body: JsonRecord, name: string, max: number): string | null {
    const value = body[name];
    if (value === undefined || value === null || value === "") {
        return null;
    }
    if (typeof value !== "string" || !value.trim()) {
        throw new HttpError(400, `${name} must be text`);
    }
    if (value.trim().length > max) {
        throw new HttpError(400, `${name} is too long`);
    }
    return value.trim();
}

function optionalTextValue(value: string | null, max: number): string | null {
    const text = value?.trim() ?? "";
    if (!text) {
        return null;
    }
    if (text.length > max) {
        throw new HttpError(400, "query value is too long");
    }
    return text;
}

function requiredQueryInteger(request: Request, name: string): number {
    const value = optionalPositiveInteger(new URL(request.url).searchParams.get(name), name);
    if (!value) {
        throw new HttpError(400, `${name} is required`);
    }
    return value;
}

function optionalPositiveInteger(value: string | null, name: string): number | null {
    if (!value) {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return parsed;
}

function safePositiveInteger(value: unknown, name: string): number {
    const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || Number(parsed) <= 0) {
        throw new HttpError(409, `${name} is unavailable`);
    }
    return Number(parsed);
}

function optionalSafePositiveInteger(value: unknown, name: string): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    return safePositiveInteger(value, name);
}

function requiredRecordText(record: JsonRecord, name: string): string {
    const value = record[name];
    if (typeof value !== "string" || !value.trim()) {
        throw new HttpError(502, `Commerce ${name} is missing`);
    }
    return value.trim();
}

function normalizeCurrency(value: unknown): string {
    if (typeof value !== "string" || !/^[a-z]{3}$/i.test(value)) {
        throw new HttpError(502, "Commerce currency is invalid");
    }
    return value.toLowerCase();
}

function optionalEnum(value: string | null, name: string, allowed: readonly string[]): string | null {
    if (!value) {
        return null;
    }
    if (!allowed.includes(value)) {
        throw new HttpError(400, `${name} is invalid`);
    }
    return value;
}

function optionalSearch(value: string | null): string | null {
    const q = value?.trim() ?? "";
    if (!q) {
        return null;
    }
    if (q.length > 120) {
        throw new HttpError(400, "q is too long");
    }
    return q.replace(/[,*()]/g, " ").trim() || null;
}

function boundedLimit(value: string | null): number {
    if (!value) {
        return 50;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
        throw new HttpError(400, "limit must be between 1 and 200");
    }
    return parsed;
}

function boundedOffset(value: string | null): number {
    if (!value) {
        return 0;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1000000) {
        throw new HttpError(400, "offset is invalid");
    }
    return parsed;
}

function percentToBps(percent: number, name: string): number {
    const bps = Math.round(percent * 100);
    if (Math.abs(percent * 100 - bps) > 0.000001) {
        throw new HttpError(400, `${name} supports at most two decimals`);
    }
    return bps;
}

function firstRow<T>(value: unknown): T {
    if (!Array.isArray(value) || !value[0]) {
        throw new HttpError(502, "database returned no row");
    }
    return value[0] as T;
}

function requiredEnv(name: string): string {
    const value = Deno.env.get(name)?.trim() ?? "";
    if (!value) {
        throw new HttpError(500, `${name} is not configured`);
    }
    return value;
}

function safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let result = 0;
    for (let index = 0; index < left.length; index++) {
        result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return result === 0;
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "content-type": "application/json" },
    });
}

function optionsResponse(): Response {
    return new Response(null, { status: 204, headers: corsHeaders });
}

function methodNotAllowed(allow: string): Response {
    return new Response("Method Not Allowed", { status: 405, headers: { ...corsHeaders, allow } });
}

async function withMethod(request: Request, method: string, handler: () => Promise<Response>): Promise<Response> {
    if (request.method !== method) {
        return methodNotAllowed(`${method}, OPTIONS`);
    }
    return handler();
}

function handleError(error: unknown): Response {
    if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
    }
    console.error(error);
    return json({ error: "internal error" }, 500);
}

const proposalStatuses = ["pending", "accepted", "rejected", "withdrawn", "expired", "superseded", "canceled"] as const;
