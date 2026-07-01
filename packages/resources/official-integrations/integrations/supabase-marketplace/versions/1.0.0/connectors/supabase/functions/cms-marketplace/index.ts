type JsonRecord = Record<string, unknown>;
type StripeBusinessType = "company" | "government_entity" | "individual" | "non_profit";

type MarketplaceProfile = {
    cms_user_id: string;
    stripe_account_id: string | null;
    country: string;
    business_type: string | null;
    onboarding_status: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
    disabled_reason: string | null;
    capabilities: JsonRecord;
    requirements_currently_due: string[];
    requirements_eventually_due: string[];
    requirements_past_due: string[];
    requirements_pending_verification: string[];
    requirements_errors: unknown[];
    future_requirements: JsonRecord;
    last_onboarding_started_at: string | null;
    last_stripe_event_id: string | null;
    last_stripe_event_at: string | null;
    created_at: string;
    updated_at: string;
};

type MarketplaceOrder = {
    id: number;
    client_reference_id: string | null;
    buyer_cms_user_id: string;
    seller_cms_user_id: string;
    stripe_payment_intent_id: string | null;
    stripe_charge_id: string | null;
    transfer_group: string | null;
    currency: string;
    amount_total: number;
    platform_fee_amount: number;
    seller_amount: number;
    status: string;
    description: string | null;
    metadata: JsonRecord;
    paid_at: string | null;
    cancelled_at: string | null;
    refunded_at: string | null;
    created_at: string;
    updated_at: string;
};

type MarketplaceTransfer = {
    id: number;
    order_id: number;
    seller_cms_user_id: string;
    stripe_transfer_id: string | null;
    stripe_reversal_id: string | null;
    idempotency_key: string | null;
    currency: string;
    amount: number;
    reversed_amount: number;
    status: string;
    failure_code: string | null;
    failure_message: string | null;
    created_at: string;
    updated_at: string;
};

type StripeAccount = JsonRecord & {
    id: string;
    object: "account";
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    country?: string;
    business_type?: string;
    requirements?: JsonRecord;
    future_requirements?: JsonRecord;
    capabilities?: JsonRecord;
    metadata?: Record<string, string>;
};

type StripePaymentIntent = JsonRecord & {
    id: string;
    client_secret?: string;
    status?: string;
    latest_charge?: string | JsonRecord | null;
};

type StripeTransferReversal = JsonRecord & {
    id: string;
    amount: number;
    currency: string;
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
    "access-control-allow-headers": "authorization, content-type, stripe-signature, x-cms-user-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

const stripeApiBase = "https://api.stripe.com/v1";
const marketplaceSchema = "marketplace";
const encoder = new TextEncoder();

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health(request));
        if (route === "/connect-status") return await withMethod(request, "GET", () => connectStatus(request));
        if (route === "/connect-onboarding") return await withMethod(request, "POST", () => connectOnboarding(request));
        if (route === "/create-payment") return await withMethod(request, "POST", () => createPayment(request));
        if (route === "/order-status") return await withMethod(request, "GET", () => orderStatus(request));
        if (route === "/stripe-webhook") return await withMethod(request, "POST", () => stripeWebhook(request));

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function health(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ ok: true });
}

async function connectStatus(request: Request): Promise<Response> {
    const { cmsUserId } = requireCmsRequest(request);
    let profile = await getProfile(cmsUserId);

    if (profile?.stripe_account_id) {
        const account = await retrieveAccount(profile.stripe_account_id);
        profile = await updateProfile(cmsUserId, profilePatchFromStripeAccount(account));
    }

    return json(publicConnectStatus(profile));
}

async function connectOnboarding(request: Request): Promise<Response> {
    const { cmsUserId } = requireCmsRequest(request);
    const body = await readJsonObject(request);
    const returnUrl = validUrl(stringField(body, "returnUrl")!, "returnUrl");
    const refreshUrl = validUrl(stringField(body, "refreshUrl")!, "refreshUrl");
    const collectionFields = collectionFieldsValue(stringField(body, "collectionFields", false));
    const businessType = businessTypeValue(stringField(body, "businessType", false)?.trim(), "businessType", 400);

    let profile = await getProfile(cmsUserId);
    if (!profile) profile = await upsertProfile({ cms_user_id: cmsUserId });

    let accountId = profile.stripe_account_id;
    if (!accountId) {
        const account = await createConnectedAccount(cmsUserId, businessType);
        accountId = account.id;
        profile = await upsertProfile({
            cms_user_id: cmsUserId,
            ...profilePatchFromStripeAccount(account),
        });
    } else {
        const account = await retrieveAccount(accountId);
        profile = await updateProfile(cmsUserId, profilePatchFromStripeAccount(account));
    }

    if (!accountId || !profile) throw new HttpError(502, "could not create Stripe connected account");

    const link = await createAccountLink(accountId, returnUrl, refreshUrl, collectionFields);
    await updateProfile(cmsUserId, { last_onboarding_started_at: new Date().toISOString() });

    return json({ url: link.url, expiresAt: link.expires_at });
}

async function createPayment(request: Request): Promise<Response> {
    const { cmsUserId } = requireCmsRequest(request);
    const body = await readJsonObject(request);

    const sellerUserId = stringField(body, "sellerUserId")!;
    const amountTotal = integerField(body, "amountTotal");
    const platformFeeAmount = integerField(body, "platformFeeAmount");
    const currency = stringField(body, "currency")!.toLowerCase();
    const clientReferenceId = stringField(body, "clientReferenceId", false);
    const description = stringField(body, "description", false);

    if (sellerUserId === cmsUserId) throw new HttpError(400, "buyer and seller must be different users");
    if (!/^[a-z]{3}$/.test(currency)) throw new HttpError(400, "currency must be a three-letter code");
    if (amountTotal <= 0) throw new HttpError(400, "amountTotal must be positive");
    if (platformFeeAmount < 0 || platformFeeAmount >= amountTotal) {
        throw new HttpError(400, "platformFeeAmount must be lower than amountTotal");
    }

    if (clientReferenceId) {
        const existing = await getOrderByClientReference(clientReferenceId);
        if (existing) {
            if (existing.buyer_cms_user_id !== cmsUserId) throw new HttpError(409, "clientReferenceId already exists");
            if (!existing.stripe_payment_intent_id) throw new HttpError(409, "existing order has no payment intent");
            const paymentIntent = await retrievePaymentIntent(existing.stripe_payment_intent_id);
            return json(paymentResponse(existing.id, existing.stripe_payment_intent_id, paymentIntent.client_secret));
        }
    }

    const seller = await getProfile(sellerUserId);
    if (!seller || !sellerCanReceiveTransfers(seller)) {
        throw new HttpError(409, "seller is not eligible to receive transfers");
    }

    const sellerAmount = amountTotal - platformFeeAmount;
    let order = await insertOrder({
        client_reference_id: clientReferenceId,
        buyer_cms_user_id: cmsUserId,
        seller_cms_user_id: sellerUserId,
        currency,
        amount_total: amountTotal,
        platform_fee_amount: platformFeeAmount,
        seller_amount: sellerAmount,
        status: "payment_pending",
        description,
        metadata: {},
    });

    const transferGroup = `cms_order_${order.id}`;
    order = await updateOrder(order.id, { transfer_group: transferGroup }) ?? order;

    try {
        const paymentIntent = await createPaymentIntent({
            amount: amountTotal,
            currency,
            description,
            transferGroup,
            orderId: order.id,
            buyerCmsUserId: cmsUserId,
            sellerCmsUserId: sellerUserId,
            platformFeeAmount,
        });
        await updateOrder(order.id, {
            stripe_payment_intent_id: paymentIntent.id,
            status: "payment_pending",
        });
        return json(paymentResponse(order.id, paymentIntent.id, paymentIntent.client_secret));
    } catch (error) {
        await updateOrder(order.id, { status: "payment_failed" }).catch(() => null);
        throw error;
    }
}

async function orderStatus(request: Request): Promise<Response> {
    const { cmsUserId } = requireCmsRequest(request);
    const url = new URL(request.url);
    const orderId = Number(url.searchParams.get("orderId"));
    if (!Number.isInteger(orderId) || orderId <= 0) throw new HttpError(400, "orderId must be a positive integer");

    const order = await getOrderById(orderId);
    if (!order) throw new HttpError(404, "order not found");
    if (order.buyer_cms_user_id !== cmsUserId && order.seller_cms_user_id !== cmsUserId) {
        throw new HttpError(404, "order not found");
    }

    return json({
        orderId: order.id,
        status: order.status,
        paymentIntentId: order.stripe_payment_intent_id ?? "",
        amountTotal: order.amount_total,
        platformFeeAmount: order.platform_fee_amount,
        sellerAmount: order.seller_amount,
        currency: order.currency,
    });
}

async function stripeWebhook(request: Request): Promise<Response> {
    const event = await verifyStripeWebhook(request);
    const eventId = stringValue(event.id) ?? "";
    const eventType = stringValue(event.type) ?? "";
    if (!eventId.startsWith("evt_") || !eventType) throw new HttpError(400, "invalid Stripe event");

    const dataObject = isRecord(event.data) && isRecord(event.data.object) ? event.data.object : {};
    const stripeAccountId = stringValue(event.account) ?? accountIdFromEvent(eventType, dataObject);
    const stripeObjectId = stringValue(dataObject.id);

    const inserted = await insertStripeEvent({
        event_id: eventId,
        event_type: eventType,
        stripe_account_id: stripeAccountId,
        stripe_object_id: stripeObjectId,
        livemode: event.livemode === true,
        api_version: stringValue(event.api_version),
        payload: event,
        status: "received",
    });

    if (!inserted) {
        const existing = await getStripeEvent(eventId);
        if (!existing || (existing.status !== "failed" && existing.status !== "received")) {
            return json({ received: true, duplicate: true, status: existing?.status ?? "duplicate" });
        }
        await updateStripeEvent(eventId, {
            status: "received",
            error_message: null,
            payload: event,
            stripe_account_id: stripeAccountId,
            stripe_object_id: stripeObjectId,
        });
    }

    try {
        const status = await processStripeEvent(eventType, dataObject, eventId, unixSecondsToIso(event.created));
        await updateStripeEvent(eventId, { status, processed_at: new Date().toISOString() });
        return json({ received: true, status });
    } catch (error) {
        await updateStripeEvent(eventId, {
            status: "failed",
            error_message: error instanceof Error ? error.message : "unknown error",
        }).catch(() => null);
        throw error;
    }
}

async function processStripeEvent(
    eventType: string,
    dataObject: JsonRecord,
    eventId: string,
    eventAt: string | undefined,
): Promise<"processed" | "ignored"> {
    if (eventType === "account.updated") {
        await handleAccountUpdated(dataObject as StripeAccount, eventId, eventAt);
        return "processed";
    }

    if (eventType === "payment_intent.succeeded") {
        const paymentIntentId = stringValue(dataObject.id);
        if (!paymentIntentId) return "ignored";
        const latestCharge = latestChargeId(dataObject.latest_charge);
        await updateOrderByPaymentIntent(paymentIntentId, {
            status: "paid",
            stripe_charge_id: latestCharge,
            paid_at: new Date().toISOString(),
        });
        return "processed";
    }

    if (eventType === "payment_intent.payment_failed") {
        const paymentIntentId = stringValue(dataObject.id);
        if (!paymentIntentId) return "ignored";
        await updateOrderByPaymentIntent(paymentIntentId, { status: "payment_failed" });
        return "processed";
    }

    if (eventType === "charge.refunded") {
        const paymentIntentId = stringValue(dataObject.payment_intent);
        if (!paymentIntentId) return "ignored";
        const amountRefunded = numberValue(dataObject.amount_refunded);
        const amount = numberValue(dataObject.amount);
        const order = await updateOrderByPaymentIntent(paymentIntentId, {
            status: amountRefunded && amount && amountRefunded < amount ? "partially_refunded" : "refunded",
            refunded_at: new Date().toISOString(),
        });
        if (order && amountRefunded) await reverseTransferForOrder(order, amountRefunded);
        return "processed";
    }

    if (eventType === "charge.dispute.created") {
        const paymentIntentId = stringValue(dataObject.payment_intent);
        if (!paymentIntentId) return "ignored";
        const order = await updateOrderByPaymentIntent(paymentIntentId, { status: "disputed" });
        if (order) await reverseTransferForOrder(order, order.amount_total);
        return "processed";
    }

    return "ignored";
}

async function reverseTransferForOrder(order: MarketplaceOrder, refundAmountTotal: number): Promise<void> {
    const transfer = await getTransferByOrder(order.id);
    if (!transfer?.stripe_transfer_id) return;

    const targetSellerReversal = sellerReversalAmount(order, refundAmountTotal);
    const remaining = Math.max(targetSellerReversal - transfer.reversed_amount, 0);
    if (remaining <= 0) return;

    const reversal = await createTransferReversal(transfer.stripe_transfer_id, {
        amount: remaining,
        orderId: order.id,
    });
    const reversedAmount = transfer.reversed_amount + remaining;
    await updateTransfer(transfer.id, {
        stripe_reversal_id: reversal.id,
        reversed_amount: reversedAmount,
        status: reversedAmount >= transfer.amount ? "reversed" : "partially_reversed",
    });
}

function sellerReversalAmount(order: MarketplaceOrder, refundAmountTotal: number): number {
    const boundedRefund = Math.min(Math.max(refundAmountTotal, 0), order.amount_total);
    const sellerShare = Math.floor((boundedRefund * order.seller_amount) / order.amount_total);
    return Math.min(sellerShare, order.seller_amount);
}

async function handleAccountUpdated(account: StripeAccount, eventId: string, eventAt: string | undefined): Promise<void> {
    if (!account.id) return;
    const patch = profilePatchFromStripeAccount(account, eventId, eventAt);
    const updated = await updateProfileByStripeAccountId(account.id, patch);
    if (updated) return;

    const cmsUserId = account.metadata?.cms_user_id;
    if (cmsUserId) await upsertProfile({ cms_user_id: cmsUserId, ...patch });
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-marketplace";
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

function requireCmsRequest(request: Request): { cmsUserId: string } {
    const expected = requiredEnv("CMS_MARKETPLACE_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, expected)) throw new HttpError(401, "invalid CMS API key");

    const cmsUserId = request.headers.get("x-cms-user-id")?.trim();
    if (!cmsUserId) throw new HttpError(401, "missing x-cms-user-id");
    return { cmsUserId };
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

function integerField(body: JsonRecord, name: string): number {
    const value = body[name];
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new HttpError(400, `${name} must be an integer`);
    }
    return value;
}

function validUrl(value: string, name: string): string {
    try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid protocol");
        return url.toString();
    } catch {
        throw new HttpError(400, `${name} must be an http(s) URL`);
    }
}

function collectionFieldsValue(value: string | undefined): "currently_due" | "eventually_due" {
    if (!value) return "currently_due";
    if (value === "currently_due" || value === "eventually_due") return value;
    throw new HttpError(400, "collectionFields must be currently_due or eventually_due");
}

function businessTypeValue(value: string | undefined, name: string, status: number): StripeBusinessType | undefined {
    if (!value) return undefined;
    if (value === "individual" || value === "company" || value === "non_profit" || value === "government_entity") {
        return value;
    }
    throw new HttpError(status, `${name} must be individual, company, non_profit, or government_entity`);
}

function paymentResponse(orderId: number, paymentIntentId: string, clientSecret: string | undefined): JsonRecord {
    if (!clientSecret) throw new HttpError(502, "Stripe did not return a client secret");
    return { orderId, paymentIntentId, clientSecret };
}

function publicConnectStatus(profile: MarketplaceProfile | null): JsonRecord {
    if (!profile) {
        return {
            connected: false,
            onboardingStatus: "not_started",
            chargesEnabled: false,
            payoutsEnabled: false,
            disabledReason: "",
            currentlyDue: [],
            pastDue: [],
            pendingVerification: [],
        };
    }
    return {
        connected: !!profile.stripe_account_id,
        onboardingStatus: profile.onboarding_status,
        chargesEnabled: profile.charges_enabled,
        payoutsEnabled: profile.payouts_enabled,
        disabledReason: profile.disabled_reason ?? "",
        currentlyDue: profile.requirements_currently_due,
        pastDue: profile.requirements_past_due,
        pendingVerification: profile.requirements_pending_verification,
    };
}

function sellerCanReceiveTransfers(profile: MarketplaceProfile): boolean {
    return !!profile.stripe_account_id
        && profile.payouts_enabled
        && profile.requirements_past_due.length === 0
        && profile.onboarding_status !== "rejected";
}

function profilePatchFromStripeAccount(account: StripeAccount, stripeEventId?: string, stripeEventAt?: string): JsonRecord {
    const requirements = objectValue(account.requirements);
    const futureRequirements = objectValue(account.future_requirements);
    return {
        stripe_account_id: account.id,
        country: typeof account.country === "string" ? account.country.toUpperCase() : undefined,
        business_type: typeof account.business_type === "string" ? account.business_type : undefined,
        onboarding_status: onboardingStatusFromAccount(account),
        charges_enabled: account.charges_enabled === true,
        payouts_enabled: account.payouts_enabled === true,
        details_submitted: account.details_submitted === true,
        disabled_reason: stringOrNull(requirements.disabled_reason),
        capabilities: objectValue(account.capabilities),
        requirements_currently_due: stringArray(requirements.currently_due),
        requirements_eventually_due: stringArray(requirements.eventually_due),
        requirements_past_due: stringArray(requirements.past_due),
        requirements_pending_verification: stringArray(requirements.pending_verification),
        requirements_errors: Array.isArray(requirements.errors) ? requirements.errors : [],
        future_requirements: futureRequirements,
        last_stripe_event_id: stripeEventId,
        last_stripe_event_at: stripeEventAt,
    };
}

function onboardingStatusFromAccount(account: StripeAccount): string {
    const requirements = objectValue(account.requirements);
    const disabledReason = stringOrNull(requirements.disabled_reason);
    const currentlyDue = stringArray(requirements.currently_due);
    const pastDue = stringArray(requirements.past_due);
    const pendingVerification = stringArray(requirements.pending_verification);

    if (disabledReason?.includes("rejected")) return "rejected";
    if (pastDue.length || disabledReason) return "restricted";
    if (pendingVerification.length) return "pending_verification";
    if ((account.payouts_enabled || account.charges_enabled) && currentlyDue.length === 0) return "enabled";
    if (currentlyDue.length) return "requirements_due";
    if (account.details_submitted) return "pending_verification";
    return "link_created";
}

async function getProfile(cmsUserId: string): Promise<MarketplaceProfile | null> {
    return selectOne<MarketplaceProfile>("profiles", { cms_user_id: cmsUserId });
}

async function upsertProfile(values: JsonRecord): Promise<MarketplaceProfile> {
    return upsertOne<MarketplaceProfile>("profiles", values, "cms_user_id");
}

async function updateProfile(cmsUserId: string, patch: JsonRecord): Promise<MarketplaceProfile | null> {
    return updateOne<MarketplaceProfile>("profiles", { cms_user_id: cmsUserId }, patch);
}

async function updateProfileByStripeAccountId(stripeAccountId: string, patch: JsonRecord): Promise<MarketplaceProfile | null> {
    return updateOne<MarketplaceProfile>("profiles", { stripe_account_id: stripeAccountId }, patch);
}

async function getOrderById(id: number): Promise<MarketplaceOrder | null> {
    return selectOne<MarketplaceOrder>("orders", { id });
}

async function getOrderByClientReference(clientReferenceId: string): Promise<MarketplaceOrder | null> {
    return selectOne<MarketplaceOrder>("orders", { client_reference_id: clientReferenceId });
}

async function insertOrder(values: JsonRecord): Promise<MarketplaceOrder> {
    return insertOne<MarketplaceOrder>("orders", values);
}

async function updateOrder(id: number, patch: JsonRecord): Promise<MarketplaceOrder | null> {
    return updateOne<MarketplaceOrder>("orders", { id }, patch);
}

async function updateOrderByPaymentIntent(paymentIntentId: string, patch: JsonRecord): Promise<MarketplaceOrder | null> {
    return updateOne<MarketplaceOrder>("orders", { stripe_payment_intent_id: paymentIntentId }, patch);
}

async function getTransferByOrder(orderId: number): Promise<MarketplaceTransfer | null> {
    return selectOne<MarketplaceTransfer>("transfers", { order_id: orderId });
}

async function updateTransfer(id: number, patch: JsonRecord): Promise<MarketplaceTransfer | null> {
    return updateOne<MarketplaceTransfer>("transfers", { id }, patch);
}

async function getStripeEvent(eventId: string): Promise<{ status: string } | null> {
    return selectOne<{ status: string }>("stripe_events", { event_id: eventId });
}

async function insertStripeEvent(values: JsonRecord): Promise<boolean> {
    const response = await rest("stripe_events", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=minimal",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (response.status === 409) return false;
    if (!response.ok) throw await restError(response);
    return true;
}

async function updateStripeEvent(eventId: string, patch: JsonRecord): Promise<void> {
    const response = await rest(`stripe_events?event_id=eq.${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: {
            "content-type": "application/json",
            prefer: "return=minimal",
        },
        body: JSON.stringify(stripUndefined(patch)),
    });
    if (!response.ok) throw await restError(response);
}

async function selectOne<T>(table: string, filters: Record<string, string | number | boolean>): Promise<T | null> {
    const response = await rest(`${table}?${filterQuery(filters)}&select=*&limit=1`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as T[];
    return rows[0] ?? null;
}

async function insertOne<T>(table: string, values: JsonRecord): Promise<T> {
    const response = await rest(`${table}?select=*`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow<T>(await response.json());
}

async function upsertOne<T>(table: string, values: JsonRecord, onConflict: string): Promise<T> {
    const response = await rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}&select=*`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow<T>(await response.json());
}

async function updateOne<T>(
    table: string,
    filters: Record<string, string | number | boolean>,
    patch: JsonRecord,
): Promise<T | null> {
    const response = await rest(`${table}?${filterQuery(filters)}&select=*`, {
        method: "PATCH",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(patch)),
    });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as T[];
    return rows[0] ?? null;
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", marketplaceSchema);
    if (init.method && init.method !== "GET") headers.set("content-profile", marketplaceSchema);

    return fetch(`${base}/rest/v1/${path}`, { ...init, headers });
}

async function retrieveAccount(accountId: string): Promise<StripeAccount> {
    return stripeRequest<StripeAccount>("GET", `/accounts/${encodeURIComponent(accountId)}`);
}

async function createConnectedAccount(cmsUserId: string, businessType?: StripeBusinessType): Promise<StripeAccount> {
    const params: JsonRecord = {
        type: "express",
        country: stripeConnectCountry(),
        capabilities: { transfers: { requested: true } },
        metadata: { cms_user_id: cmsUserId },
    };

    const configuredBusinessType = businessType
        ?? businessTypeValue(Deno.env.get("STRIPE_CONNECT_BUSINESS_TYPE")?.trim(), "STRIPE_CONNECT_BUSINESS_TYPE", 500);
    if (configuredBusinessType) params.business_type = configuredBusinessType;

    if (optionalEnv("STRIPE_CONNECT_CARD_PAYMENTS", "false").toLowerCase() === "true") {
        params.capabilities = {
            ...(params.capabilities as JsonRecord),
            card_payments: { requested: true },
        };
    }

    return stripeRequest<StripeAccount>("POST", "/accounts", params, `cms-connect-account:${cmsUserId}`);
}

async function createAccountLink(
    accountId: string,
    returnUrl: string,
    refreshUrl: string,
    collectionFields: "currently_due" | "eventually_due",
): Promise<{ url: string; expires_at?: number }> {
    return stripeRequest("POST", "/account_links", {
        account: accountId,
        return_url: returnUrl,
        refresh_url: refreshUrl,
        type: "account_onboarding",
        collection_options: { fields: collectionFields },
    });
}

async function createPaymentIntent(input: {
    amount: number;
    currency: string;
    description?: string;
    transferGroup: string;
    orderId: number;
    buyerCmsUserId: string;
    sellerCmsUserId: string;
    platformFeeAmount: number;
}): Promise<StripePaymentIntent> {
    return stripeRequest<StripePaymentIntent>("POST", "/payment_intents", {
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        transfer_group: input.transferGroup,
        automatic_payment_methods: { enabled: true },
        metadata: {
            order_id: String(input.orderId),
            buyer_cms_user_id: input.buyerCmsUserId,
            seller_cms_user_id: input.sellerCmsUserId,
            platform_fee_amount: String(input.platformFeeAmount),
        },
    }, `cms-create-payment:${input.orderId}`);
}

async function retrievePaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    return stripeRequest<StripePaymentIntent>("GET", `/payment_intents/${encodeURIComponent(paymentIntentId)}`);
}

async function createTransferReversal(
    transferId: string,
    input: { amount: number; orderId: number },
): Promise<StripeTransferReversal> {
    return stripeRequest<StripeTransferReversal>("POST", `/transfers/${encodeURIComponent(transferId)}/reversals`, {
        amount: input.amount,
        metadata: { order_id: String(input.orderId) },
    }, `cms-reverse-transfer:${input.orderId}:${input.amount}`);
}

async function stripeRequest<T>(
    method: "GET" | "POST",
    path: string,
    params?: JsonRecord,
    idempotencyKey?: string,
): Promise<T> {
    const headers = new Headers();
    headers.set("authorization", `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`);
    if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);

    let url = `${stripeApiBase}${path}`;
    let body: URLSearchParams | undefined;

    if (method === "GET" && params) {
        const query = formParams(params);
        url += `?${query.toString()}`;
    } else if (method === "POST") {
        headers.set("content-type", "application/x-www-form-urlencoded");
        body = formParams(params ?? {});
    }

    const response = await fetch(url, { method, headers, body });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message = isRecord(data) && isRecord(data.error) && typeof data.error.message === "string"
            ? data.error.message
            : `Stripe request failed (${response.status})`;
        throw new HttpError(502, message);
    }
    return data as T;
}

async function verifyStripeWebhook(request: Request): Promise<JsonRecord> {
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new HttpError(400, "missing stripe-signature header");

    const timestamp = signaturePart(signature, "t");
    const expected = signatureParts(signature, "v1");
    if (!timestamp || expected.length === 0) throw new HttpError(400, "invalid stripe-signature header");

    const toleranceSeconds = Number(Deno.env.get("STRIPE_WEBHOOK_TOLERANCE_SECONDS") ?? "300");
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > toleranceSeconds) throw new HttpError(400, "stale Stripe webhook signature");

    const actual = await hmacSha256Hex(requiredEnv("STRIPE_WEBHOOK_SECRET"), `${timestamp}.${payload}`);
    if (!expected.some(value => safeEqualHex(value, actual))) throw new HttpError(400, "invalid Stripe webhook signature");

    try {
        const parsed = JSON.parse(payload);
        if (!isRecord(parsed)) throw new Error("not an object");
        return parsed;
    } catch {
        throw new HttpError(400, "invalid Stripe webhook JSON");
    }
}

function formParams(value: JsonRecord): URLSearchParams {
    const params = new URLSearchParams();
    appendParams(params, "", value);
    return params;
}

function appendParams(params: URLSearchParams, prefix: string, value: unknown): void {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
        for (const entry of value) appendParams(params, `${prefix}[]`, entry);
        return;
    }
    if (typeof value === "object") {
        for (const [key, entry] of Object.entries(value as JsonRecord)) {
            appendParams(params, prefix ? `${prefix}[${key}]` : key, entry);
        }
        return;
    }
    params.append(prefix, String(value));
}

function requiredEnv(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) throw new Error(`Missing environment variable: ${name}`);
    return value;
}

function optionalEnv(name: string, fallback: string): string {
    const value = Deno.env.get(name)?.trim();
    return value || fallback;
}

function serviceRoleKey(): string {
    const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (legacy) return legacy;

    const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!raw) throw new Error("Missing SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY");
    try {
        const parsed = JSON.parse(raw) as JsonRecord;
        const key = parsed.default;
        if (typeof key === "string" && key) return key;
    } catch {
        throw new Error("SUPABASE_SECRET_KEYS must be valid JSON");
    }
    throw new Error("SUPABASE_SECRET_KEYS.default is missing");
}

function stripeConnectCountry(): string {
    const country = optionalEnv("STRIPE_CONNECT_COUNTRY", "FR").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(500, "STRIPE_CONNECT_COUNTRY must be an ISO country code");
    return country;
}

function filterQuery(filters: Record<string, string | number | boolean>): string {
    return Object.entries(filters)
        .map(([key, value]) => `${encodeURIComponent(key)}=eq.${encodeURIComponent(String(value))}`)
        .join("&");
}

function firstRow<T>(value: unknown): T {
    if (!Array.isArray(value) || !value[0]) throw new HttpError(502, "database did not return a row");
    return value[0] as T;
}

async function restError(response: Response): Promise<HttpError> {
    const body = await response.text().catch(() => "");
    return new HttpError(502, `database request failed (${response.status}): ${body || response.statusText}`);
}

function stripUndefined(value: JsonRecord): JsonRecord {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function objectValue(value: unknown): JsonRecord {
    return isRecord(value) ? value : {};
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value ? value : null;
}

function accountIdFromEvent(eventType: string, dataObject: JsonRecord): string | undefined {
    if (eventType === "account.updated") return stringValue(dataObject.id);
    return undefined;
}

function latestChargeId(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (isRecord(value)) return stringValue(value.id);
    return undefined;
}

function stringValue(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unixSecondsToIso(value: unknown): string | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return new Date(value * 1000).toISOString();
}

function signaturePart(header: string, name: string): string | undefined {
    return signatureParts(header, name)[0];
}

function signatureParts(header: string, name: string): string[] {
    return header
        .split(",")
        .map(part => part.trim().split("="))
        .filter(([key, value]) => key === name && !!value)
        .map(([, value]) => value!);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return [...new Uint8Array(signature)]
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function safeEqual(a: string, b: string): boolean {
    const left = encoder.encode(a);
    const right = encoder.encode(b);
    const length = Math.max(left.length, right.length);
    let diff = left.length ^ right.length;
    for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
    return diff === 0;
}

function safeEqualHex(a: string, b: string): boolean {
    if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
    return safeEqual(a.toLowerCase(), b.toLowerCase());
}
