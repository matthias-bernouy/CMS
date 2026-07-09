import { afterAll, describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository, validateDashboard } from "@bernouy/cms-dashboards";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import {
    handleSourceRequest,
    InMemorySourceRepository,
    validateSource,
    type SourceRepository,
} from "@bernouy/cms-sources";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const edgeFunctionUrl = "../integrations/orders/versions/1.0.0/connectors/supabase/functions/cms-orders/index.ts";

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

describe("orders 1.0.0 source", () => {
    test("loads from the official integration catalog", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const list = await repo.list();
        const definition = await repo.get("orders");
        const serialized = JSON.stringify(definition);

        expect(list.map(entry => entry.kind)).toContain("orders");
        expect(definition?.kind).toBe("orders");
        expect(definition?.version).toBe("1.0.0");
        expect(serialized).toContain("\"dataApiSchemas\":[\"orders\"]");
        expect(serialized).not.toContain("externalId");
        expect(serialized).not.toContain("externalCheckoutRef");
        expect(serialized).not.toContain("attachExternalReference");
        expect(serialized).not.toContain("order_external_refs");
        expect(serialized).not.toContain("stock_reservation");
        expect(serialized).not.toContain("paymentStatus");
        expect(serialized).not.toContain("shipmentStatus");
        expect(serialized).not.toContain("stockQuantity");
        expect(serialized).not.toContain("taxAmount");
        expect(serialized).not.toContain("discountAmount");
    });

    test("installs the orders source and dashboard", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:orders");
        const dashboard = await harness.dashboards.getDashboard("orders-dashboard");

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(dashboard).toBeTruthy();
        expect(validateDashboard(dashboard!, { source: source! })).toEqual([]);
        expect(harness.deployment?.dataApiSchemas).toEqual(["orders"]);
        expect(harness.deployment?.functions.map(fn => fn.name)).toEqual(["cms-orders"]);
        expect(String(harness.deployment?.functions[0]?.secrets?.CMS_ORDERS_API_KEY)).toStartWith("cms_or_");

        const endpointUrns = source?.endpoints.map(endpoint => endpoint.urn) ?? [];
        expect(endpointUrns).toContain("urn:orders:orders");
        expect(endpointUrns).toContain("urn:orders:order");
        expect(endpointUrns).toContain("urn:orders:myOrders");
        expect(endpointUrns).toContain("urn:orders:createOrder");
        expect(endpointUrns).toContain("urn:orders:updateOrderStatus");
        expect(endpointUrns).not.toContain("urn:orders:attachExternalReference");

        const dashboardJson = JSON.stringify(dashboard);
        expect(dashboardJson).toContain("Create order");
        expect(dashboardJson).not.toContain("External id");
        expect(dashboardJson).not.toContain("Checkout ref");
        expect(dashboardJson).not.toContain("Attach reference");
        expect(dashboardJson).not.toContain("External references");
        expect(dashboardJson).not.toContain("Product ref");
        expect(dashboardJson).not.toContain("Variant ref");
        expect(dashboardJson).not.toContain("stock_reservation");
        expect(dashboardJson).not.toContain("paymentStatus");
        expect(dashboardJson).not.toContain("shipmentStatus");
        expect(dashboardJson).not.toContain("\"widget\":\"w-create\"");
        expect(dashboardJson).not.toContain("\"collection\"");
    });

    test("creates an order without external ids and updates status through the installed source", async () => {
        const harness = await createHarness();
        const createdResponse = await sourceJson(harness, "createOrder", validOrderBody());
        const created = await jsonBody(createdResponse);

        expect(createdResponse.status).toBe(201);
        expect(created).toMatchObject({
            id: "order-1001",
            orderNumber: "ORD-1001",
            sellerUserId: "seller-1",
            buyerUserId: "buyer-1",
            status: "draft",
            currency: "eur",
            subtotalAmount: 5000,
            totalAmount: 5000,
        });
        expect(created.lines).toEqual([
            expect.objectContaining({
                title: "Notebook",
                quantity: 2,
                unitAmount: 2500,
                lineTotal: 5000,
            }),
        ]);
        expect(Object.hasOwn(created, "references")).toBe(false);
        expect(harness.orders[0]).toMatchObject({
            id: "order-1001",
            seller_cms_user_id: "seller-1",
            buyer_cms_user_id: "buyer-1",
            subtotal_amount: 5000,
            total_amount: 5000,
            created_by: "admin-1",
        });
        expect(harness.lines[0]).toMatchObject({
            order_id: "order-1001",
            quantity: 2,
            unit_amount: 2500,
            line_total: 5000,
        });

        const statusResponse = await sourceJson(harness, "updateOrderStatus", {
            orderId: "order-1001",
            status: "placed",
            message: "Checkout confirmed",
        });
        const updated = await jsonBody(statusResponse);
        expect(statusResponse.status).toBe(200);
        expect(updated).toMatchObject({
            id: "order-1001",
            status: "placed",
        });
        expect(Object.hasOwn(updated, "references")).toBe(false);
        expect(updated.events).toEqual([
            expect.objectContaining({ eventType: "order.status_changed", message: "Checkout confirmed" }),
            expect.objectContaining({ eventType: "order.created" }),
        ]);

        const listResponse = await sourceGet(harness, "orders", { q: "ORD-1001" });
        const list = await jsonBody(listResponse);
        expect(listResponse.status).toBe(200);
        expect(list.items).toEqual([
            expect.objectContaining({ id: "order-1001", status: "placed" }),
        ]);
    });

    test("rejects total mismatches", async () => {
        const harness = await createHarness();
        const totalResponse = await sourceJson(harness, "createOrder", {
            ...validOrderBody(),
            totalAmount: 4999,
        });
        expect(totalResponse.status).toBe(400);
        expect(await jsonBody(totalResponse)).toEqual({ error: "totalAmount must equal the sum of order lines" });
    });
});

async function createHarness() {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
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
                    { type: "function", id: "cms-orders", action: "deployed" },
                ],
            };
        },
    };

    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("orders");
    if (!definition) throw new Error("orders definition not found");
    const result = await importIntegration(
        {
            sources,
            secrets,
            roles,
            dashboards,
            connectorDeployers: [deployer],
        },
        { kind: "orders", answers: { id: "orders" }, options: {} },
        [definition as IntegrationDefinition],
    );

    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
        SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-key",
    };

    const handler = await loadEdgeHandler();
    const orders: JsonRecord[] = [];
    const lines: JsonRecord[] = [];
    const events: JsonRecord[] = [];
    let lineId = 1;
    let eventId = 1;

    activeFetch = async (input, init) => {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const requestBody = method === "GET" || method === "HEAD" ? "" : await request.clone().text();

        if (url.origin === supabaseUrl) {
            expect(request.headers.get("apikey")).toBe("supabase-secret-key");
            expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
            expect(request.headers.get("accept-profile")).toBe("orders");
            if (method !== "GET" && method !== "HEAD") {
                expect(request.headers.get("content-profile")).toBe("orders");
            }
        }

        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/orders" && method === "POST") {
            const row = {
                ...JSON.parse(requestBody) as JsonRecord,
                created_at: "2026-07-06T10:00:00.000Z",
                updated_at: "2026-07-06T10:00:00.000Z",
            };
            orders.push(row);
            return jsonResponse([row], 201);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/order_lines" && method === "POST") {
            const body = JSON.parse(requestBody) as JsonRecord[];
            const inserted = body.map(row => ({
                id: lineId++,
                ...row,
                created_at: "2026-07-06T10:00:01.000Z",
            }));
            lines.push(...inserted);
            return jsonResponse(inserted, 201);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/order_events" && method === "POST") {
            const row = {
                id: eventId++,
                ...JSON.parse(requestBody) as JsonRecord,
                created_at: `2026-07-06T10:00:0${eventId}.000Z`,
            };
            events.push(row);
            return jsonResponse([], 201);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/orders" && method === "GET") {
            return jsonResponse(filterOrders(orders, url), 200, { "content-range": `0-${Math.max(orders.length - 1, 0)}/${orders.length}` });
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/order_lines" && method === "GET") {
            const orderId = eqValue(url.searchParams.get("order_id"));
            return jsonResponse(lines.filter(line => line.order_id === orderId), 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/order_events" && method === "GET") {
            const orderId = eqValue(url.searchParams.get("order_id"));
            return jsonResponse(events.filter(event => event.order_id === orderId).slice().reverse(), 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/orders" && method === "PATCH") {
            const id = eqValue(url.searchParams.get("id"));
            const order = orders.find(row => row.id === id);
            if (!order) return jsonResponse([], 200);
            Object.assign(order, JSON.parse(requestBody), { updated_at: "2026-07-06T10:00:05.000Z" });
            return jsonResponse([order], 200);
        }

        throw new Error(`unexpected fetch: ${method} ${request.url}`);
    };

    return {
        result,
        sources,
        secrets,
        roles,
        dashboards,
        deployment,
        orders,
        lines,
        events,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-orders/`)) {
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

function filterOrders(orders: JsonRecord[], url: URL): JsonRecord[] {
    const id = eqValue(url.searchParams.get("id"));
    if (id) return orders.filter(row => row.id === id);
    const orderNumber = eqValue(url.searchParams.get("order_number"));
    if (orderNumber) return orders.filter(row => row.order_number === orderNumber);
    const status = eqValue(url.searchParams.get("status"));
    return orders.filter(row => !status || row.status === status);
}

function eqValue(value: string | null): string {
    return value?.startsWith("eq.") ? value.slice("eq.".length) : "";
}

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) await import(edgeFunctionUrl);
    if (!edgeHandler) throw new Error("cms-orders edge handler was not registered");
    return edgeHandler;
}

async function sourceJson(harness: {
    sources: SourceRepository;
    sourceFetch: typeof fetch;
    resolveSecret: (ref: string) => Promise<string | undefined>;
}, endpoint: string, body: JsonRecord): Promise<Response> {
    return await handleSourceRequest(
        harness.sources,
        new Request(`http://cms.local${sourcePrefix}orders/${endpoint}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "admin-1" }),
            },
        },
    );
}

async function sourceGet(harness: {
    sources: SourceRepository;
    sourceFetch: typeof fetch;
    resolveSecret: (ref: string) => Promise<string | undefined>;
}, endpoint: string, params: Record<string, string>): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}orders/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(
        harness.sources,
        new Request(url),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "admin-1" }),
            },
        },
    );
}

function validOrderBody(): JsonRecord {
    return {
        id: "order-1001",
        orderNumber: "ORD-1001",
        sellerUserId: "seller-1",
        buyerUserId: "buyer-1",
        buyerEmail: "buyer@example.test",
        buyerName: "Buyer Test",
        currency: "eur",
        status: "draft",
        lines: [
            {
                title: "Notebook",
                sku: "NB-1",
                quantity: 2,
                unitAmount: 2500,
                productSnapshot: {
                    title: "Notebook",
                    slug: "notebook",
                },
                variantSnapshot: {
                    sku: "NB-1",
                    title: "Default",
                },
            },
        ],
    };
}

function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    if (input instanceof Request && !init) return input;
    return new Request(input instanceof Request ? input.url : String(input), {
        method: init?.method ?? (input instanceof Request ? input.method : undefined),
        headers: init?.headers ?? (input instanceof Request ? input.headers : undefined),
        body: init?.body ?? (input instanceof Request ? input.body : undefined),
        redirect: init?.redirect,
    });
}

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            ...headers,
        },
    });
}

async function jsonBody(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    try {
        return JSON.parse(text) as JsonRecord;
    } catch {
        throw new Error(`expected JSON response, got ${response.status}: ${text}`);
    }
}
