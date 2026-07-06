import { afterAll, describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import {
    handleSourceRequest,
    InMemorySourceRepository,
    type SourceRepository,
} from "@bernouy/cms-sources";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const stripeUrl = "https://api.stripe.com";
const edgeFunctionUrl = "../integrations/stripe-connect/versions/1.0.0/connectors/supabase/functions/cms-stripe-connect/index.ts";

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

(globalThis as { Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown } }).Deno = {
    env: { get: (key) => activeEnv[key] },
    serve(handler) {
        edgeHandler = handler;
        return { shutdown() { /* test stub */ } };
    },
};
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

describe("stripe-connect 1.0.0 source", () => {
    test("creates connected accounts and destination-charge payments through the installed CMS source", async () => {
        const harness = await createHarness();

        const config = await okJson(await sourceRequest(harness, "getConnectClientConfig"));
        const initial = await okJson(await sourceRequest(harness, "getConnectStatus"));
        const sellerSession = await okJson(await sourceJson(harness, "createConnectOnboardingSessionForUser", {
            email: "seller@example.com",
            country: "FR",
            businessType: "individual",
        }, { userId: "seller-1" }));
        const payment = await okJson(await sourceJson(harness, "createPayment", {
            sellerUserId: "seller-1",
            amountTotal: "1200",
            applicationFeeAmount: "120",
            currency: "EUR",
            clientReferenceId: "order-1",
            description: "Order 1",
        }));
        const repeated = await okJson(await sourceJson(harness, "createPayment", {
            sellerUserId: "seller-1",
            amountTotal: "1200",
            applicationFeeAmount: "120",
            currency: "EUR",
            clientReferenceId: "order-1",
            description: "Order 1",
        }));
        const listedAccounts = await okJson(await sourceRequest(harness, "listConnectAccounts", { q: "seller", limit: "20" }));
        const listedPayments = await okJson(await sourceRequest(harness, "listPayments", { q: "order", limit: "20" }));
        const fetched = await okJson(await sourceRequest(harness, "getPayment", { paymentId: String(payment.paymentId) }));

        expect(config).toEqual({ publishableKey: "pk_test_123" });
        expect(initial).toMatchObject({ exists: false, userId: "user-123", connected: false, onboardingStatus: "not_started" });
        expect(sellerSession).toMatchObject({
            exists: true,
            userId: "seller-1",
            connected: true,
            onboardingStatus: "onboarding_started",
            chargesEnabled: true,
            clientSecret: "as_seller-1_secret",
        });
        expect(payment).toMatchObject({
            clientReferenceId: "order-1",
            buyerUserId: "user-123",
            sellerUserId: "seller-1",
            amountTotal: 1200,
            applicationFeeAmount: 120,
            sellerAmount: 1080,
            status: "payment_pending",
            stripePaymentIntentId: "pi_1",
            clientSecret: "pi_1_secret",
        });
        expect(repeated.paymentId).toBe(payment.paymentId);
        expect(listedAccounts.accounts).toEqual([expect.objectContaining({ userId: "seller-1", stripeAccountId: "acct_seller_1" })]);
        expect(listedPayments.payments).toEqual([expect.objectContaining({ clientReferenceId: "order-1", stripePaymentIntentId: "pi_1" })]);
        expect(fetched).toMatchObject({ paymentId: payment.paymentId, clientReferenceId: "order-1" });
        expect(harness.rest.rows("payments")).toHaveLength(1);
    });

    test("rejects ineligible sellers and hidden payments", async () => {
        const harness = await createHarness();

        const ineligible = await sourceJson(harness, "createPayment", {
            sellerUserId: "missing-seller",
            amountTotal: 1200,
            applicationFeeAmount: 120,
        });
        const sellerSession = await okJson(await sourceJson(harness, "createConnectOnboardingSessionForUser", {
            email: "seller@example.com",
        }, { userId: "seller-1" }));
        const payment = await okJson(await sourceJson(harness, "createPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1200,
            applicationFeeAmount: 120,
            clientReferenceId: "private-order",
        }));
        const hidden = await sourceRequestWithUser(harness, "stranger", "getPayment", { paymentId: String(payment.paymentId) });

        expect(sellerSession.connected).toBe(true);
        expect(ineligible.status).toBe(409);
        expect(await jsonBody(ineligible)).toEqual({ error: "seller is not eligible to receive payments" });
        expect(hidden.status).toBe(403);
        expect(await jsonBody(hidden)).toEqual({ error: "payment is not visible to this user" });
    });
});

async function createHarness() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("stripe-connect");
    if (!definition) throw new Error("stripe-connect definition not found");

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const dashboards = new InMemoryDashboardRepository();
    const importedBlocs: IntegrationBlocArtifact[] = [];
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "schema.sql", action: "applied" },
                    { type: "function", id: "cms-stripe-connect", action: "deployed" },
                ],
            };
        },
    };

    const result = await importIntegration(
        {
            sources,
            secrets,
            dashboards,
            connectorDeployers: [deployer],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        {
            kind: "stripe-connect",
            answers: {
                id: "stripe-connect",
                stripeSecretKey: "sk_test_123",
                stripePublishableKey: "pk_test_123",
                defaultCountry: "FR",
                defaultCurrency: "EUR",
            },
            options: {},
        },
        [definition],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
    };

    const handler = await loadEdgeHandler();
    const rest = new StripeConnectMock();
    activeFetch = async (input, init) => rest.fetch(input, init);

    return {
        result,
        sources,
        secrets,
        dashboards,
        importedBlocs,
        deployment,
        rest,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-stripe-connect/`)) {
                    throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
                }
                return await handler(request);
            } catch (error) {
                return new Response(error instanceof Error ? error.stack ?? error.message : String(error), { status: 599 });
            }
        },
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return await secrets.get(key) ?? undefined;
        },
    };
}

class StripeConnectMock {
    private readonly tables: Record<string, JsonRecord[]> = {
        accounts: [],
        payments: [],
    };
    private nextPaymentId = 1;
    private nextIntentId = 1;

    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();

        if (url.origin === stripeUrl) return await this.stripeFetch(request, url, method);
        if (url.origin !== supabaseUrl || !url.pathname.startsWith("/rest/v1/")) {
            throw new Error(`unexpected fetch: ${method} ${request.url}`);
        }

        expect(request.headers.get("apikey")).toBe("supabase-secret-key");
        expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
        expect(request.headers.get("accept-profile")).toBe("stripe_connect");
        if (method !== "GET" && method !== "HEAD") expect(request.headers.get("content-profile")).toBe("stripe_connect");
        const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
        if (!this.tables[table]) throw new Error(`unexpected table: ${table}`);
        if (method === "GET") return jsonResponse(this.select(table, url));
        if (method === "POST") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            const inserted = table === "accounts" ? this.upsertAccount(row) : this.insertPayment(row);
            return jsonResponse([inserted], 201);
        }
        if (method === "PATCH") {
            const patch = JSON.parse(await request.text()) as JsonRecord;
            const rows = this.selectRefs(table, url).map(row => this.update(row, patch));
            return jsonResponse(rows);
        }
        throw new Error(`unexpected method: ${method} ${request.url}`);
    }

    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map(row => ({ ...row }));
    }

    private async stripeFetch(request: Request, url: URL, method: string): Promise<Response> {
        expect(request.headers.get("authorization")).toBe("Bearer sk_test_123");
        if (url.pathname === "/v1/accounts" && method === "POST") {
            const params = new URLSearchParams(await request.text());
            const userId = params.get("metadata[cms_user_id]") || "unknown";
            return jsonResponse(stripeAccount(userId, `acct_${userId.replace(/[^a-z0-9]+/gi, "_")}`));
        }
        if (url.pathname.startsWith("/v1/accounts/") && method === "GET") {
            const accountId = decodeURIComponent(url.pathname.slice("/v1/accounts/".length));
            const row = this.tables.accounts.find(account => account.stripe_account_id === accountId);
            return jsonResponse(stripeAccount(String(row?.cms_user_id ?? "unknown"), accountId));
        }
        if (url.pathname === "/v1/account_sessions" && method === "POST") {
            const params = new URLSearchParams(await request.text());
            const accountId = params.get("account") || "acct_unknown";
            const row = this.tables.accounts.find(account => account.stripe_account_id === accountId);
            return jsonResponse({
                account: accountId,
                client_secret: `as_${row?.cms_user_id ?? "unknown"}_secret`,
                expires_at: 1800000000,
            });
        }
        if (url.pathname === "/v1/payment_intents" && method === "POST") {
            const id = `pi_${this.nextIntentId++}`;
            return jsonResponse({
                id,
                client_secret: `${id}_secret`,
                status: "requires_payment_method",
                latest_charge: null,
            });
        }
        if (url.pathname.startsWith("/v1/payment_intents/") && method === "GET") {
            const id = decodeURIComponent(url.pathname.slice("/v1/payment_intents/".length));
            return jsonResponse({
                id,
                client_secret: `${id}_secret`,
                status: "requires_payment_method",
                latest_charge: null,
            });
        }
        throw new Error(`unexpected Stripe fetch: ${method} ${url}`);
    }

    private select(table: string, url: URL): JsonRecord[] {
        return this.selectRefs(table, url).map(row => ({ ...row }));
    }

    private selectRefs(table: string, url: URL): JsonRecord[] {
        let rows = this.tables[table]!;
        for (const [key, value] of url.searchParams.entries()) {
            const filter = filterValue(value);
            if (!filter || filter.operator !== "eq") continue;
            if (!["cms_user_id", "id", "client_reference_id", "onboarding_status", "status"].includes(key)) continue;
            rows = rows.filter(row => same(row[key], filter.value));
        }
        const or = url.searchParams.get("or");
        if (or) {
            const search = or.match(/ilike\.\*([^*]+)\*/)?.[1]?.toLowerCase() ?? "";
            const fields = table === "accounts"
                ? ["cms_user_id", "stripe_account_id"]
                : ["client_reference_id", "buyer_cms_user_id", "seller_cms_user_id", "stripe_payment_intent_id"];
            rows = rows.filter(row => fields.some(key => String(row[key] ?? "").toLowerCase().includes(search)));
        }
        return rows;
    }

    private upsertAccount(value: JsonRecord): JsonRecord {
        const now = "2026-07-06T12:00:00.000Z";
        const index = this.tables.accounts.findIndex(row => same(row.cms_user_id, value.cms_user_id));
        const next = {
            ...(index >= 0 ? this.tables.accounts[index] : defaultAccountRow(String(value.cms_user_id), now)),
            ...value,
            updated_at: now,
        };
        if (index >= 0) this.tables.accounts[index] = next;
        else this.tables.accounts.push(next);
        return { ...next };
    }

    private insertPayment(value: JsonRecord): JsonRecord {
        const now = "2026-07-06T12:05:00.000Z";
        const row = {
            id: this.nextPaymentId++,
            stripe_payment_intent_id: null,
            stripe_charge_id: null,
            transfer_group: null,
            paid_at: null,
            cancelled_at: null,
            refunded_at: null,
            created_at: now,
            updated_at: now,
            ...value,
        };
        this.tables.payments.push(row);
        return { ...row };
    }

    private update(row: JsonRecord, patch: JsonRecord): JsonRecord {
        Object.assign(row, patch, { updated_at: "2026-07-06T12:10:00.000Z" });
        return { ...row };
    }
}

function stripeAccount(userId: string, accountId: string): JsonRecord {
    return {
        id: accountId,
        country: "FR",
        business_type: "individual",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        capabilities: { card_payments: "active", transfers: "active" },
        requirements: {
            currently_due: [],
            eventually_due: [],
            past_due: [],
            pending_verification: [],
            errors: [],
        },
        future_requirements: {},
        metadata: { cms_user_id: userId },
    };
}

function defaultAccountRow(userId: string, now: string): JsonRecord {
    return {
        cms_user_id: userId,
        stripe_account_id: null,
        country: "FR",
        business_type: null,
        onboarding_status: "not_started",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        disabled_reason: null,
        capabilities: {},
        requirements_currently_due: [],
        requirements_eventually_due: [],
        requirements_past_due: [],
        requirements_pending_verification: [],
        requirements_errors: [],
        future_requirements: {},
        last_onboarding_started_at: null,
        created_at: now,
        updated_at: now,
    };
}

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) await import(edgeFunctionUrl);
    if (!edgeHandler) throw new Error("cms-stripe-connect edge handler was not registered");
    return edgeHandler;
}

async function sourceRequest(harness: Harness, endpoint: string, params: Record<string, string> = {}): Promise<Response> {
    return await sourceRequestWithUser(harness, "user-123", endpoint, params);
}

async function sourceRequestWithUser(harness: Harness, userId: string, endpoint: string, params: Record<string, string> = {}): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}stripe-connect/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await proxySource(harness, userId, new Request(url));
}

async function sourceJson(harness: Harness, endpoint: string, body: unknown, params: Record<string, string> = {}): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}stripe-connect/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await proxySource(harness, "user-123", new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    }));
}

async function proxySource(harness: Harness, userId: string, request: Request): Promise<Response> {
    return await handleSourceRequest(harness.sources, request, {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: userId }),
        },
    });
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    return input instanceof Request ? input : new Request(input, init);
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function filterValue(value: string | null): { operator: string; value: string } | null {
    if (!value) return null;
    const [operator, ...rest] = value.split(".");
    return { operator: operator ?? "", value: rest.join(".") };
}

function same(a: unknown, b: unknown): boolean {
    return String(a) === String(b);
}

async function jsonBody(response: Response): Promise<JsonRecord> {
    return await response.json() as JsonRecord;
}

async function okJson(response: Response): Promise<JsonRecord> {
    const body = await jsonBody(response);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    return body;
}
