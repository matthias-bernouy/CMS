type JsonRecord = Record<string, unknown>;
type StripeBusinessType = "company" | "government_entity" | "individual" | "non_profit";

type ConnectAccountRow = {
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
    created_at: string;
    updated_at: string;
};

type ConnectPaymentRow = {
    id: number;
    client_reference_id: string | null;
    buyer_cms_user_id: string;
    seller_cms_user_id: string;
    stripe_payment_intent_id: string | null;
    stripe_charge_id: string | null;
    transfer_group: string | null;
    currency: string;
    amount_total: number;
    application_fee_amount: number;
    seller_amount: number;
    status: string;
    description: string | null;
    paid_at: string | null;
    cancelled_at: string | null;
    refunded_at: string | null;
    created_at: string;
    updated_at: string;
};

type StripeAccount = JsonRecord & {
    id: string;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    country?: string;
    business_type?: string | null;
    requirements?: JsonRecord;
    future_requirements?: JsonRecord;
    capabilities?: JsonRecord;
};

type StripePaymentIntent = JsonRecord & {
    id: string;
    client_secret?: string;
    status?: string;
    latest_charge?: string | JsonRecord | null;
};

type StripeAccountSession = JsonRecord & {
    account: string;
    client_secret: string;
    expires_at?: number;
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

const stripeApiBase = "https://api.stripe.com/v1";
const connectSchema = "stripe_connect";
const accountSelect = [
    "cms_user_id",
    "stripe_account_id",
    "country",
    "business_type",
    "onboarding_status",
    "charges_enabled",
    "payouts_enabled",
    "details_submitted",
    "disabled_reason",
    "capabilities",
    "requirements_currently_due",
    "requirements_eventually_due",
    "requirements_past_due",
    "requirements_pending_verification",
    "requirements_errors",
    "future_requirements",
    "last_onboarding_started_at",
    "created_at",
    "updated_at",
].join(",");
const paymentSelect = [
    "id",
    "client_reference_id",
    "buyer_cms_user_id",
    "seller_cms_user_id",
    "stripe_payment_intent_id",
    "stripe_charge_id",
    "transfer_group",
    "currency",
    "amount_total",
    "application_fee_amount",
    "seller_amount",
    "status",
    "description",
    "paid_at",
    "cancelled_at",
    "refunded_at",
    "created_at",
    "updated_at",
].join(",");

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health(request));
        if (route === "/connect/config") return await withMethod(request, "GET", () => connectConfig(request));
        if (route === "/connect/status") return await withMethod(request, "GET", () => connectStatus(request));
        if (route === "/connect/onboarding") return await withMethod(request, "POST", () => connectOnboarding(request));
        if (route === "/connect/onboarding/session") return await withMethod(request, "POST", () => connectOnboardingSession(request));
        if (route === "/payments") return await withMethod(request, "POST", () => createPayment(request));
        if (route === "/payments/payment") return await withMethod(request, "GET", () => getPayment(request));
        if (route === "/admin/accounts") return await withMethod(request, "GET", () => listAccounts(request));
        if (route === "/admin/accounts/account") return await withMethod(request, "GET", () => getAccountByUserId(request));
        if (route === "/admin/accounts/account/onboarding") return await withMethod(request, "POST", () => adminCreateOnboarding(request));
        if (route === "/admin/accounts/account/onboarding/session") return await withMethod(request, "POST", () => adminCreateOnboardingSession(request));
        if (route === "/admin/payments") {
            if (request.method === "GET") return await listPayments(request);
            if (request.method === "POST") return await adminCreatePayment(request);
            return methodNotAllowed("GET, POST, OPTIONS");
        }
        if (route === "/admin/payments/payment") return await withMethod(request, "GET", () => getPaymentById(request));

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function health(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    return json({ ok: true });
}

async function connectConfig(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ publishableKey: requiredEnv("STRIPE_PUBLISHABLE_KEY") });
}

async function connectStatus(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const account = await syncAccountForUser(userId);
    return json(publicAccountStatus(account, userId));
}

async function connectOnboarding(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const body = await readJsonObject(request);
    return json(await createOnboardingForUser(userId, body));
}

async function connectOnboardingSession(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const body = await readJsonObject(request);
    return json(await createOnboardingSessionForUser(userId, body));
}

async function adminCreateOnboarding(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const userId = requiredQueryText(request, "userId", 200);
    const body = await readJsonObject(request);
    return json(await createOnboardingForUser(userId, body));
}

async function adminCreateOnboardingSession(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const userId = requiredQueryText(request, "userId", 200);
    const body = await readJsonObject(request);
    return json(await createOnboardingSessionForUser(userId, body));
}

async function ensureConnectedAccountForUser(userId: string, body: JsonRecord): Promise<{
    account: ConnectAccountRow;
    stripeAccountId: string;
}> {
    const email = optionalEmail(body, "email");
    const country = optionalCountry(body, "country") ?? defaultCountry();
    const businessType = optionalBusinessType(body, "businessType");

    let account = await getAccountRow(userId);
    let stripeAccountId = account?.stripe_account_id ?? null;
    if (!stripeAccountId) {
        const stripeAccount = await createConnectedAccount({
            userId,
            country,
            email,
            businessType,
        });
        stripeAccountId = stripeAccount.id;
        account = await upsertAccountRow({
            cms_user_id: userId,
            ...accountPatchFromStripe(stripeAccount),
        });
    } else {
        account = await syncAccountForUser(userId);
    }

    if (!stripeAccountId) throw new HttpError(502, "could not create connected account");
    if (!account) throw new HttpError(502, "could not store connected account");
    return { account, stripeAccountId };
}

async function createOnboardingForUser(userId: string, body: JsonRecord): Promise<JsonRecord> {
    const returnUrl = validUrl(requiredString(body, "returnUrl", 2048), "returnUrl");
    const refreshUrl = validUrl(requiredString(body, "refreshUrl", 2048), "refreshUrl");
    const { account, stripeAccountId } = await ensureConnectedAccountForUser(userId, body);
    const link = await createAccountLink(stripeAccountId, returnUrl, refreshUrl);
    const updated = await updateAccountRow(userId, {
        onboarding_status: "onboarding_started",
        last_onboarding_started_at: new Date().toISOString(),
    }) ?? account;

    return {
        ...publicAccountStatus(updated, userId),
        url: stringAt(link, "url"),
        expiresAt: numberAt(link, "expires_at"),
    };
}

async function createOnboardingSessionForUser(userId: string, body: JsonRecord): Promise<JsonRecord> {
    const { account, stripeAccountId } = await ensureConnectedAccountForUser(userId, body);
    const session = await createAccountSession(stripeAccountId);
    const updated = await updateAccountRow(userId, {
        onboarding_status: "onboarding_started",
        last_onboarding_started_at: new Date().toISOString(),
    }) ?? account;

    return {
        ...publicAccountStatus(updated, userId),
        clientSecret: session.client_secret,
        expiresAt: session.expires_at,
    };
}

async function createPayment(request: Request): Promise<Response> {
    const { userId: buyerUserId } = requireCmsRequest(request);
    const body = await readJsonObject(request);
    return json(await createPaymentForBuyer(buyerUserId, body));
}

async function adminCreatePayment(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    const buyerUserId = requiredString(body, "buyerUserId", 200);
    return json(await createPaymentForBuyer(buyerUserId, body));
}

async function createPaymentForBuyer(buyerUserId: string, body: JsonRecord): Promise<JsonRecord> {
    const sellerUserId = requiredString(body, "sellerUserId", 200);
    const amountTotal = requiredInteger(body, "amountTotal");
    const applicationFeeAmount = requiredInteger(body, "applicationFeeAmount");
    const currency = optionalCurrency(body, "currency") ?? defaultCurrency();
    const clientReferenceId = optionalText(body, "clientReferenceId", 200);
    const description = optionalText(body, "description", 500);

    if (sellerUserId === buyerUserId) throw new HttpError(400, "buyer and seller must be different users");
    if (amountTotal <= 0) throw new HttpError(400, "amountTotal must be positive");
    if (applicationFeeAmount < 0 || applicationFeeAmount >= amountTotal) {
        throw new HttpError(400, "applicationFeeAmount must be lower than amountTotal");
    }

    if (clientReferenceId) {
        const existing = await getPaymentByClientReference(clientReferenceId);
        if (existing) {
            if (existing.buyer_cms_user_id !== buyerUserId) throw new HttpError(409, "clientReferenceId already exists");
            const synced = await syncPayment(existing);
            return publicPaymentWithClientSecret(synced, await paymentClientSecret(synced));
        }
    }

    const seller = await syncAccountForUser(sellerUserId);
    if (!seller?.stripe_account_id || !sellerCanReceivePayments(seller)) {
        throw new HttpError(409, "seller is not eligible to receive payments");
    }

    const sellerAmount = amountTotal - applicationFeeAmount;
    let payment = await insertPayment({
        client_reference_id: clientReferenceId,
        buyer_cms_user_id: buyerUserId,
        seller_cms_user_id: sellerUserId,
        currency,
        amount_total: amountTotal,
        application_fee_amount: applicationFeeAmount,
        seller_amount: sellerAmount,
        status: "payment_pending",
        description,
    });

    const transferGroup = `cms_payment_${payment.id}`;
    payment = await updatePayment(payment.id, { transfer_group: transferGroup }) ?? payment;

    try {
        const paymentIntent = await createStripePaymentIntent({
            payment,
            sellerStripeAccountId: seller.stripe_account_id,
        });
        payment = await updatePayment(payment.id, {
            stripe_payment_intent_id: paymentIntent.id,
            stripe_charge_id: chargeId(paymentIntent),
            status: paymentStatusFromStripe(paymentIntent),
            paid_at: paymentIntent.status === "succeeded" ? new Date().toISOString() : null,
            cancelled_at: paymentIntent.status === "canceled" ? new Date().toISOString() : null,
        }) ?? payment;
        return publicPaymentWithClientSecret(payment, paymentIntent.client_secret ?? "");
    } catch (error) {
        await updatePayment(payment.id, { status: "payment_failed" }).catch(() => null);
        throw error;
    }
}

async function getPayment(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const paymentId = requiredQueryInteger(request, "paymentId");
    const payment = await getPaymentRow(paymentId);
    if (!payment) throw new HttpError(404, "payment not found");
    if (payment.buyer_cms_user_id !== userId && payment.seller_cms_user_id !== userId) {
        throw new HttpError(403, "payment is not visible to this user");
    }
    return json(publicPayment(await syncPayment(payment)));
}

async function listAccounts(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });

    const params = new URL(request.url).searchParams;
    const limit = queryLimit(params.get("limit"));
    const search = searchPattern(params.get("q"));
    const status = optionalStatus(params.get("status"));
    const query = new URLSearchParams({
        select: accountSelect,
        order: "updated_at.desc",
        limit: String(limit),
    });

    if (status) query.set("onboarding_status", `eq.${status}`);
    if (search) {
        const clauses = [
            `cms_user_id.ilike.${search}`,
            `stripe_account_id.ilike.${search}`,
        ].join(",");
        query.set("or", `(${clauses})`);
    }

    const response = await rest(`accounts?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ConnectAccountRow[];
    return json({
        accounts: rows.map(row => publicAccount(row)),
        total: rows.length,
    });
}

async function getAccountByUserId(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const userId = requiredQueryText(request, "userId", 200);
    const row = await syncAccountForUser(userId);
    return json(publicAccountStatus(row, userId));
}

async function listPayments(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });

    const params = new URL(request.url).searchParams;
    const limit = queryLimit(params.get("limit"));
    const search = searchPattern(params.get("q"));
    const status = optionalPaymentStatus(params.get("status"));
    const query = new URLSearchParams({
        select: paymentSelect,
        order: "created_at.desc",
        limit: String(limit),
    });

    if (status) query.set("status", `eq.${status}`);
    if (search) {
        const clauses = [
            `client_reference_id.ilike.${search}`,
            `buyer_cms_user_id.ilike.${search}`,
            `seller_cms_user_id.ilike.${search}`,
            `stripe_payment_intent_id.ilike.${search}`,
        ].join(",");
        query.set("or", `(${clauses})`);
    }

    const response = await rest(`payments?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ConnectPaymentRow[];
    return json({
        payments: rows.map(publicPayment),
        total: rows.length,
    });
}

async function getPaymentById(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const paymentId = requiredQueryInteger(request, "paymentId");
    const row = await getPaymentRow(paymentId);
    if (!row) throw new HttpError(404, "payment not found");
    return json(publicPayment(await syncPayment(row)));
}

async function syncAccountForUser(userId: string): Promise<ConnectAccountRow | null> {
    const account = await getAccountRow(userId);
    if (!account?.stripe_account_id) return account;
    const stripeAccount = await retrieveAccount(account.stripe_account_id);
    return await updateAccountRow(userId, accountPatchFromStripe(stripeAccount));
}

async function getAccountRow(userId: string): Promise<ConnectAccountRow | null> {
    const response = await rest(
        `accounts?cms_user_id=eq.${encodeURIComponent(userId)}&select=${accountSelect}&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ConnectAccountRow[];
    return rows[0] ?? null;
}

async function upsertAccountRow(values: JsonRecord): Promise<ConnectAccountRow> {
    const query = new URLSearchParams();
    query.set("on_conflict", "cms_user_id");
    query.set("select", accountSelect);

    const response = await rest(`accounts?${query.toString()}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow<ConnectAccountRow>(await response.json());
}

async function updateAccountRow(userId: string, values: JsonRecord): Promise<ConnectAccountRow | null> {
    const response = await rest(
        `accounts?cms_user_id=eq.${encodeURIComponent(userId)}&select=${accountSelect}`,
        {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                prefer: "return=representation",
            },
            body: JSON.stringify(stripUndefined(values)),
        },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ConnectAccountRow[];
    return rows[0] ?? null;
}

async function insertPayment(values: JsonRecord): Promise<ConnectPaymentRow> {
    const response = await rest(`payments?select=${paymentSelect}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow<ConnectPaymentRow>(await response.json());
}

async function updatePayment(paymentId: number, values: JsonRecord): Promise<ConnectPaymentRow | null> {
    const response = await rest(
        `payments?id=eq.${paymentId}&select=${paymentSelect}`,
        {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                prefer: "return=representation",
            },
            body: JSON.stringify(stripUndefined(values)),
        },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ConnectPaymentRow[];
    return rows[0] ?? null;
}

async function getPaymentRow(paymentId: number): Promise<ConnectPaymentRow | null> {
    const response = await rest(
        `payments?id=eq.${paymentId}&select=${paymentSelect}&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ConnectPaymentRow[];
    return rows[0] ?? null;
}

async function getPaymentByClientReference(clientReferenceId: string): Promise<ConnectPaymentRow | null> {
    const response = await rest(
        `payments?client_reference_id=eq.${encodeURIComponent(clientReferenceId)}&select=${paymentSelect}&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as ConnectPaymentRow[];
    return rows[0] ?? null;
}

async function syncPayment(payment: ConnectPaymentRow): Promise<ConnectPaymentRow> {
    if (!payment.stripe_payment_intent_id) return payment;
    const intent = await retrievePaymentIntent(payment.stripe_payment_intent_id);
    const status = paymentStatusFromStripe(intent);
    return await updatePayment(payment.id, {
        status,
        stripe_charge_id: chargeId(intent) ?? payment.stripe_charge_id,
        paid_at: status === "paid" ? payment.paid_at ?? new Date().toISOString() : payment.paid_at,
        cancelled_at: status === "cancelled" ? payment.cancelled_at ?? new Date().toISOString() : payment.cancelled_at,
    }) ?? payment;
}

async function paymentClientSecret(payment: ConnectPaymentRow): Promise<string> {
    if (!payment.stripe_payment_intent_id) return "";
    const intent = await retrievePaymentIntent(payment.stripe_payment_intent_id);
    return intent.client_secret ?? "";
}

async function createConnectedAccount(options: {
    userId: string;
    country: string;
    email?: string | null;
    businessType?: StripeBusinessType | null;
}): Promise<StripeAccount> {
    const params = new URLSearchParams();
    params.set("country", options.country);
    params.set("controller[fees][payer]", "application");
    params.set("controller[losses][payments]", "application");
    params.set("controller[stripe_dashboard][type]", "express");
    params.set("capabilities[card_payments][requested]", "true");
    params.set("capabilities[transfers][requested]", "true");
    params.set("metadata[cms_user_id]", options.userId);
    if (options.email) params.set("email", options.email);
    if (options.businessType) params.set("business_type", options.businessType);

    return await stripe<StripeAccount>("/accounts", {
        method: "POST",
        body: params,
    }, { idempotencyKey: `cms_connect_account_${await digest(options.userId)}` });
}

async function retrieveAccount(accountId: string): Promise<StripeAccount> {
    return await stripe<StripeAccount>(`/accounts/${encodeURIComponent(accountId)}`, { method: "GET" });
}

async function createAccountLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<JsonRecord> {
    const params = new URLSearchParams();
    params.set("account", accountId);
    params.set("return_url", returnUrl);
    params.set("refresh_url", refreshUrl);
    params.set("type", "account_onboarding");

    return await stripe<JsonRecord>("/account_links", {
        method: "POST",
        body: params,
    });
}

async function createAccountSession(accountId: string): Promise<StripeAccountSession> {
    const params = new URLSearchParams();
    params.set("account", accountId);
    params.set("components[account_onboarding][enabled]", "true");

    return await stripe<StripeAccountSession>("/account_sessions", {
        method: "POST",
        body: params,
    });
}

async function createStripePaymentIntent(options: {
    payment: ConnectPaymentRow;
    sellerStripeAccountId: string;
}): Promise<StripePaymentIntent> {
    const params = new URLSearchParams();
    params.set("amount", String(options.payment.amount_total));
    params.set("currency", options.payment.currency);
    params.set("automatic_payment_methods[enabled]", "true");
    params.set("application_fee_amount", String(options.payment.application_fee_amount));
    params.set("transfer_data[destination]", options.sellerStripeAccountId);
    params.set("transfer_group", options.payment.transfer_group ?? `cms_payment_${options.payment.id}`);
    params.set("metadata[cms_payment_id]", String(options.payment.id));
    params.set("metadata[buyer_cms_user_id]", options.payment.buyer_cms_user_id);
    params.set("metadata[seller_cms_user_id]", options.payment.seller_cms_user_id);
    if (options.payment.client_reference_id) params.set("metadata[client_reference_id]", options.payment.client_reference_id);
    if (options.payment.description) params.set("description", options.payment.description);

    return await stripe<StripePaymentIntent>("/payment_intents", {
        method: "POST",
        body: params,
    }, { idempotencyKey: `cms_connect_payment_${options.payment.id}` });
}

async function retrievePaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    const params = new URLSearchParams();
    params.set("expand[]", "latest_charge");
    return await stripe<StripePaymentIntent>(
        `/payment_intents/${encodeURIComponent(paymentIntentId)}?${params.toString()}`,
        { method: "GET" },
    );
}

async function stripe<T extends JsonRecord>(
    path: string,
    init: RequestInit,
    options: { idempotencyKey?: string } = {},
): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`);
    if (init.body instanceof URLSearchParams) headers.set("content-type", "application/x-www-form-urlencoded");
    if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
    const response = await fetch(`${stripeApiBase}${path}`, { ...init, headers });
    const data = await response.json().catch(() => null);
    if (response.ok && isRecord(data)) return data as T;
    throw stripeError(response.status, data);
}

function stripeError(status: number, data: unknown): HttpError {
    const error = isRecord(data) && isRecord(data.error) ? data.error : null;
    const message = error && typeof error.message === "string"
        ? error.message
        : `Stripe request failed (${status})`;
    return new HttpError(status >= 400 && status < 500 ? status : 502, message);
}

function accountPatchFromStripe(account: StripeAccount): JsonRecord {
    const requirements = objectAt(account, "requirements");
    const futureRequirements = objectAt(account, "future_requirements");
    return {
        stripe_account_id: account.id,
        country: (typeof account.country === "string" && account.country ? account.country.toUpperCase() : defaultCountry()),
        business_type: validBusinessType(account.business_type) ? account.business_type : null,
        onboarding_status: accountStatus(account),
        charges_enabled: Boolean(account.charges_enabled),
        payouts_enabled: Boolean(account.payouts_enabled),
        details_submitted: Boolean(account.details_submitted),
        disabled_reason: stringAt(requirements, "disabled_reason") || null,
        capabilities: isRecord(account.capabilities) ? account.capabilities : {},
        requirements_currently_due: stringArrayAt(requirements, "currently_due"),
        requirements_eventually_due: stringArrayAt(requirements, "eventually_due"),
        requirements_past_due: stringArrayAt(requirements, "past_due"),
        requirements_pending_verification: stringArrayAt(requirements, "pending_verification"),
        requirements_errors: arrayAt(requirements, "errors"),
        future_requirements: isRecord(futureRequirements) ? futureRequirements : {},
    };
}

function accountStatus(account: StripeAccount): string {
    const requirements = objectAt(account, "requirements");
    const disabledReason = stringAt(requirements, "disabled_reason");
    if (disabledReason?.includes("rejected")) return "rejected";
    if (account.charges_enabled && account.payouts_enabled) return "enabled";
    if (stringArrayAt(requirements, "past_due").length || stringArrayAt(requirements, "currently_due").length) {
        return "requirements_due";
    }
    if (stringArrayAt(requirements, "pending_verification").length) return "pending_verification";
    if (account.details_submitted) return "pending_verification";
    return account.id ? "restricted" : "not_started";
}

function sellerCanReceivePayments(account: ConnectAccountRow): boolean {
    return Boolean(account.stripe_account_id && account.charges_enabled);
}

function paymentStatusFromStripe(paymentIntent: StripePaymentIntent): string {
    switch (paymentIntent.status) {
        case "succeeded":
            return "paid";
        case "canceled":
            return "cancelled";
        case "requires_action":
        case "requires_confirmation":
        case "requires_capture":
            return "requires_action";
        case "requires_payment_method":
        case "processing":
        default:
            return "payment_pending";
    }
}

function chargeId(paymentIntent: StripePaymentIntent): string | null {
    const latestCharge = paymentIntent.latest_charge;
    if (typeof latestCharge === "string") return latestCharge;
    if (isRecord(latestCharge) && typeof latestCharge.id === "string") return latestCharge.id;
    return null;
}

function publicAccountStatus(row: ConnectAccountRow | null, userId: string): JsonRecord {
    if (!row) {
        return {
            exists: false,
            userId,
            connected: false,
            onboardingStatus: "not_started",
            chargesEnabled: false,
            payoutsEnabled: false,
            detailsSubmitted: false,
            currentlyDue: [],
            eventuallyDue: [],
            pastDue: [],
            pendingVerification: [],
        };
    }
    return publicAccount(row);
}

function publicAccount(row: ConnectAccountRow): JsonRecord {
    return {
        exists: true,
        userId: row.cms_user_id,
        stripeAccountId: row.stripe_account_id,
        connected: Boolean(row.stripe_account_id),
        country: row.country,
        businessType: row.business_type,
        onboardingStatus: row.onboarding_status,
        chargesEnabled: row.charges_enabled,
        payoutsEnabled: row.payouts_enabled,
        detailsSubmitted: row.details_submitted,
        disabledReason: row.disabled_reason,
        currentlyDue: row.requirements_currently_due,
        eventuallyDue: row.requirements_eventually_due,
        pastDue: row.requirements_past_due,
        pendingVerification: row.requirements_pending_verification,
        lastOnboardingStartedAt: row.last_onboarding_started_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function publicPayment(row: ConnectPaymentRow): JsonRecord {
    return {
        paymentId: row.id,
        clientReferenceId: row.client_reference_id,
        buyerUserId: row.buyer_cms_user_id,
        sellerUserId: row.seller_cms_user_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        stripeChargeId: row.stripe_charge_id,
        transferGroup: row.transfer_group,
        currency: row.currency,
        amountTotal: row.amount_total,
        applicationFeeAmount: row.application_fee_amount,
        sellerAmount: row.seller_amount,
        status: row.status,
        description: row.description,
        paidAt: row.paid_at,
        cancelledAt: row.cancelled_at,
        refundedAt: row.refunded_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function publicPaymentWithClientSecret(row: ConnectPaymentRow, clientSecret: string): JsonRecord {
    return {
        ...publicPayment(row),
        clientSecret,
    };
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-stripe-connect";
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
    const expected = requiredEnv("CMS_STRIPE_CONNECT_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, expected)) throw new HttpError(401, "invalid CMS API key");

    const requireUser = options.requireUser ?? true;
    const userId = request.headers.get("x-user-id")?.trim() || "";
    if (requireUser && !userId) throw new HttpError(401, "missing x-user-id");
    if (userId.length > 200) throw new HttpError(400, "x-user-id is too long");
    return { userId };
}

async function rest(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept-profile", connectSchema);
    if (init.method && init.method !== "GET") headers.set("content-profile", connectSchema);
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

function requiredString(body: JsonRecord, name: string, maxLength: number): string {
    const value = body[name];
    if (typeof value !== "string") throw new HttpError(400, `${name} is required`);
    const normalized = value.trim();
    if (!normalized) throw new HttpError(400, `${name} is required`);
    if (normalized.length > maxLength) throw new HttpError(400, `${name} is too long`);
    return normalized;
}

function optionalText(body: JsonRecord, name: string, maxLength: number): string | null {
    const value = body[name];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") throw new HttpError(400, `${name} must be a string`);
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw new HttpError(400, `${name} is too long`);
    return normalized;
}

function optionalEmail(body: JsonRecord, name: string): string | null {
    const value = optionalText(body, name, 320);
    if (!value) return null;
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, `${name} is invalid`);
    return email;
}

function optionalCountry(body: JsonRecord, name: string): string | null {
    const value = optionalText(body, name, 2);
    if (!value) return null;
    const country = value.toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, `${name} must be a two-letter country code`);
    return country;
}

function optionalCurrency(body: JsonRecord, name: string): string | null {
    const value = optionalText(body, name, 3);
    if (!value) return null;
    const currency = value.toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) throw new HttpError(400, `${name} must be a three-letter currency code`);
    return currency;
}

function optionalBusinessType(body: JsonRecord, name: string): StripeBusinessType | null {
    const value = optionalText(body, name, 32);
    if (!value) return null;
    if (!validBusinessType(value)) throw new HttpError(400, `${name} is invalid`);
    return value;
}

function validBusinessType(value: unknown): value is StripeBusinessType {
    return value === "company" ||
        value === "government_entity" ||
        value === "individual" ||
        value === "non_profit";
}

function requiredInteger(body: JsonRecord, name: string): number {
    const value = body[name];
    if (typeof value !== "number" || !Number.isInteger(value)) throw new HttpError(400, `${name} must be an integer`);
    return value;
}

function validUrl(value: string, name: string): string {
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

function requiredQueryText(request: Request, name: string, maxLength: number): string {
    const value = new URL(request.url).searchParams.get(name)?.trim() ?? "";
    if (!value) throw new HttpError(400, `${name} is required`);
    if (value.length > maxLength) throw new HttpError(400, `${name} is too long`);
    return value;
}

function requiredQueryInteger(request: Request, name: string): number {
    const value = Number(new URL(request.url).searchParams.get(name));
    if (!Number.isInteger(value) || value <= 0) throw new HttpError(400, `${name} must be a positive integer`);
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
        .replace(/[^A-Za-z0-9@._+\-\s:]/g, " ")
        .trim()
        .replace(/\s+/g, "*");
    return safe ? `*${safe}*` : null;
}

function optionalStatus(value: string | null): string | null {
    const status = value?.trim() ?? "";
    if (!status) return null;
    if (![
        "not_started",
        "link_created",
        "onboarding_started",
        "requirements_due",
        "pending_verification",
        "enabled",
        "restricted",
        "rejected",
    ].includes(status)) throw new HttpError(400, "status is invalid");
    return status;
}

function optionalPaymentStatus(value: string | null): string | null {
    const status = value?.trim() ?? "";
    if (!status) return null;
    if (![
        "payment_pending",
        "requires_action",
        "paid",
        "payment_failed",
        "cancelled",
        "partially_refunded",
        "refunded",
        "disputed",
    ].includes(status)) throw new HttpError(400, "status is invalid");
    return status;
}

function defaultCountry(): string {
    const value = (Deno.env.get("STRIPE_CONNECT_DEFAULT_COUNTRY") ?? "FR").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(value)) throw new HttpError(500, "STRIPE_CONNECT_DEFAULT_COUNTRY is invalid");
    return value;
}

function defaultCurrency(): string {
    const value = (Deno.env.get("STRIPE_CONNECT_DEFAULT_CURRENCY") ?? "eur").trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(value)) throw new HttpError(500, "STRIPE_CONNECT_DEFAULT_CURRENCY is invalid");
    return value;
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

function objectAt(value: JsonRecord, key: string): JsonRecord {
    const child = value[key];
    return isRecord(child) ? child : {};
}

function stringAt(value: JsonRecord, key: string): string {
    const child = value[key];
    return typeof child === "string" ? child : "";
}

function numberAt(value: JsonRecord, key: string): number | undefined {
    const child = value[key];
    return typeof child === "number" ? child : undefined;
}

function arrayAt(value: JsonRecord, key: string): unknown[] {
    const child = value[key];
    return Array.isArray(child) ? child : [];
}

function stringArrayAt(value: JsonRecord, key: string): string[] {
    return arrayAt(value, key).filter((entry): entry is string => typeof entry === "string");
}

async function digest(value: string): Promise<string> {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(buffer)]
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 48);
}

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
