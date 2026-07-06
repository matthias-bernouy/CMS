import { afterAll, describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import {
    handleSourceRequest,
    InMemorySourceRepository,
    validateSource,
    type SourceRepository,
} from "@bernouy/cms-sources";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const edgeFunctionUrl = "../integrations/offers/versions/1.0.0/connectors/supabase/functions/cms-offers/index.ts";

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

describe("offers 1.0.0 source", () => {
    test("loads from the official integration catalog", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const list = await repo.list();
        const integration = await repo.get("offers");
        const serialized = JSON.stringify(integration);

        expect(list.map(entry => entry.kind)).toContain("offers");
        expect(integration?.kind).toBe("offers");
        expect(integration?.version).toBe("1.0.0");
        expect(serialized).toContain("\"dataApiSchemas\":[\"offers\"]");
        expect(serialized).toContain("upsertMyOffer");
        expect(serialized).not.toContain("upsertDiscount");
        expect(serialized).not.toContain("couponCode");
        expect(serialized).not.toContain("orderId");
        expect(serialized).not.toContain("paymentIntent");
    });

    test("installs the offers source and dashboard", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:offers");
        const dashboard = await harness.dashboards.getDashboard("offers-offers");
        const endpointUrns = source?.endpoints.map(endpoint => endpoint.urn) ?? [];

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(endpointUrns).toContain("urn:offers:offers");
        expect(endpointUrns).toContain("urn:offers:offer");
        expect(endpointUrns).toContain("urn:offers:upsertOffer");
        expect(endpointUrns).toContain("urn:offers:upsertMyOffer");
        expect(endpointUrns).toContain("urn:offers:myOffers");
        expect(endpointUrns).toContain("urn:offers:archiveOffer");
        expect(endpointUrns).toContain("urn:offers:deleteOffer");
        expect(endpointUrns).not.toContain("urn:offers:productLookup");
        expect(endpointUrns).not.toContain("urn:offers:productLookupItem");
        expect(dashboard).toBeTruthy();
        const dashboardJson = JSON.stringify(dashboard);
        expect(dashboardJson).toContain("Create offer");
        expect(dashboardJson).toContain("Save offer");
        expect(dashboardJson).toContain("Archive offer");
        expect(dashboardJson).toContain("External item id");
        expect(dashboardJson).not.toContain("productLookup");
        expect(dashboardJson).not.toContain("Coupon");
        expect(dashboardJson).not.toContain("Discount");
        expect(harness.deployment?.dataApiSchemas).toEqual(["offers"]);
        const functionSecrets = harness.deployment?.functions[0]?.secrets ?? {};
        expect(String(functionSecrets.CMS_OFFERS_API_KEY)).toStartWith("cms_of_");
    });

    test("writes merchant and marketplace offers through the installed CMS source", async () => {
        const harness = await createHarness();

        const merchant = await okJson(await sourceJson(harness, "upsertOffer", {
            slug: "merchant-racket",
            title: "Merchant racket",
            description: "Classic ecommerce offer",
            productId: "100",
            sellerKind: "merchant",
            sellerId: "default",
            priceAmount: "12900",
            currency: "EUR",
            compareAtAmount: "14900",
            taxBehavior: "included",
            status: "active",
            visibility: "public",
            availability: "available",
            quantityAvailable: "12",
        }));
        const marketplace = await okJson(await sourceJson(harness, "upsertMyOffer", {
            slug: "seller-racket",
            title: "Seller racket",
            sellerKind: "merchant",
            sellerId: "spoofed",
            productId: "100",
            priceAmount: 9900,
            currency: "eur",
            status: "active",
        }));
        const listed = await okJson(await sourceRequest(harness, "offers", { q: "racket", status: "active", limit: "20" }));
        const mine = await okJson(await sourceRequest(harness, "myOffers", { status: "active" }));
        const detail = await okJson(await sourceRequest(harness, "offer", { id: String(merchant.id) }));

        expect(merchant).toMatchObject({
            slug: "merchant-racket",
            title: "Merchant racket",
            productId: "100",
            sellerKind: "merchant",
            sellerId: "default",
            priceAmount: 12900,
            currency: "eur",
            compareAtAmount: 14900,
            taxBehavior: "included",
            status: "active",
            visibility: "public",
            availability: "available",
            quantityAvailable: 12,
        });
        expect(marketplace).toMatchObject({
            slug: "seller-racket",
            sellerKind: "user",
            sellerId: "user-123",
        });
        expect(listed.items).toEqual([
            expect.objectContaining({ slug: "merchant-racket" }),
            expect.objectContaining({ slug: "seller-racket", sellerKind: "user", sellerId: "user-123" }),
        ]);
        expect(mine.items).toEqual([
            expect.objectContaining({ slug: "seller-racket", sellerId: "user-123" }),
        ]);
        expect(detail).toMatchObject({ id: merchant.id, slug: "merchant-racket", priceAmount: 12900 });
        expect(harness.rest.lastWriteHeaders()?.get("x-cms-user-id")).toBeNull();
        expect(harness.rest.checkedProfiles).toContain("offers");
        expect(harness.rest.checkedProfiles).not.toContain("products");
    });

    test("keeps external reference writes idempotent", async () => {
        const harness = await createHarness();
        const first = await okJson(await sourceJson(harness, "upsertOffer", {
            externalReference: {
                provider: "import",
                externalId: "external-offer-1",
            },
            data: {
                slug: "external-offer",
                title: "External offer",
                priceAmount: 1500,
                currency: "eur",
            },
        }));
        const second = await okJson(await sourceJson(harness, "upsertOffer", {
            externalReference: {
                provider: "import",
                externalId: "external-offer-1",
            },
            data: {
                title: "External offer updated",
                priceAmount: 1700,
            },
        }));
        const archived = await okJson(await sourceJson(harness, "archiveOffer", {}, { id: String(first.id) }));
        const deleted = await okJson(await sourceDelete(harness, "deleteOffer", { id: String(first.id) }));

        expect(second.id).toBe(first.id);
        expect(second).toMatchObject({ title: "External offer updated", priceAmount: 1700 });
        expect(archived).toMatchObject({ id: first.id, status: "archived", availability: "unavailable" });
        expect(deleted).toEqual({ deleted: true, id: String(first.id) });
        expect(harness.rest.rows("external_references")).toEqual([]);
        expect(harness.rest.rows("offers")).toEqual([]);
    });
});

async function createHarness() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("offers");
    if (!definition) throw new Error("offers definition not found");

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
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
                    { type: "function", id: "cms-offers", action: "deployed" },
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
        },
        { kind: "offers", answers: { id: "offers" }, options: {} },
        [definition],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
    };

    const handler = await loadEdgeHandler();
    const rest = new OffersRestMock();
    activeFetch = async (input, init) => rest.fetch(input, init);

    return {
        result,
        sources,
        secrets,
        dashboards,
        deployment,
        rest,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-offers/`)) {
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

class OffersRestMock {
    readonly checkedProfiles: string[] = [];
    private lastHeaders: Headers | null = null;
    private nextOfferId = 1;
    private nextExternalReferenceId = 1;
    private readonly tables: Record<string, JsonRecord[]> = {
        offers: [],
        external_references: [],
    };

    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();

        if (url.origin !== supabaseUrl || !url.pathname.startsWith("/rest/v1/")) {
            throw new Error(`unexpected fetch: ${method} ${request.url}`);
        }
        expect(request.headers.get("apikey")).toBe("supabase-secret-key");
        expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
        const profile = request.headers.get("accept-profile") ?? "";
        this.checkedProfiles.push(profile);
        expect(profile).toBe("offers");
        if (method !== "GET" && method !== "HEAD") expect(request.headers.get("content-profile")).toBe(profile);
        if (method !== "GET" && method !== "HEAD") this.lastHeaders = new Headers(request.headers);

        const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
        if (!this.tables[table]) throw new Error(`unexpected table: ${table}`);
        if (method === "GET") {
            const rows = this.select(table, url);
            return jsonResponse(rows, 200, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
        }
        if (method === "POST") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            const inserted = this.insert(table, row);
            const prefer = request.headers.get("prefer") ?? "";
            return prefer.includes("return=minimal") ? new Response(null, { status: 201 }) : jsonResponse([inserted], 201);
        }
        if (method === "PATCH") {
            const patch = JSON.parse(await request.text()) as JsonRecord;
            return jsonResponse(this.patch(table, url, patch));
        }
        if (method === "DELETE") return jsonResponse(this.delete(table, url));
        throw new Error(`unexpected method: ${method} ${request.url}`);
    }

    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map(row => ({ ...row }));
    }

    lastWriteHeaders(): Headers | null {
        return this.lastHeaders;
    }

    private select(table: string, url: URL): JsonRecord[] {
        let rows = this.tables[table]!;
        for (const [key, value] of url.searchParams.entries()) {
            if (["select", "order", "limit"].includes(key)) continue;
            const filter = filterValue(value);
            if (!filter) continue;
            rows = rows.filter(row => matchesFilter(row[key], filter));
        }
        return rows.map(row => ({ ...row }));
    }

    private insert(table: string, value: JsonRecord): JsonRecord {
        const rows = this.tables[table]!;
        const now = "2026-07-06T10:00:00.000Z";
        const id = table === "offers" ? this.nextOfferId++ : table === "external_references" ? this.nextExternalReferenceId++ : rows.length + 1;
        const next = {
            id,
            created_at: now,
            updated_at: now,
            ...value,
        };
        rows.push(next);
        return { ...next };
    }

    private patch(table: string, url: URL, patch: JsonRecord): JsonRecord[] {
        const rows = this.tables[table]!;
        const id = filterValue(url.searchParams.get("id"));
        const out: JsonRecord[] = [];
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index]!;
            if (id?.operator === "eq" && same(row.id, id.value)) {
                const next = { ...row, ...patch, updated_at: "2026-07-06T10:00:01.000Z" };
                rows[index] = next;
                out.push({ ...next });
            }
        }
        return out;
    }

    private delete(table: string, url: URL): JsonRecord[] {
        const rows = this.tables[table]!;
        const id = filterValue(url.searchParams.get("id"));
        const deleted: JsonRecord[] = [];
        this.tables[table] = rows.filter(row => {
            const match = id?.operator === "eq" && same(row.id, id.value);
            if (match) deleted.push({ ...row });
            return !match;
        });
        if (table === "offers" && deleted.length) {
            const deletedIds = new Set(deleted.map(row => String(row.id)));
            this.tables.external_references = this.tables.external_references!.filter(row => !deletedIds.has(String(row.entity_id)));
        }
        return deleted;
    }
}

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) await import(edgeFunctionUrl);
    if (!edgeHandler) throw new Error("cms-offers edge handler was not registered");
    return edgeHandler;
}

async function sourceRequest(
    harness: { sources: SourceRepository; sourceFetch: typeof fetch; resolveSecret: (ref: string) => Promise<string | undefined> },
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`${sourcePrefix}offers/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(harness.sources, new Request(url), sourceContext(harness));
}

async function sourceJson(
    harness: Awaited<ReturnType<typeof createHarness>>,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`${sourcePrefix}offers/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(harness.sources, new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    }), sourceContext(harness));
}

async function sourceDelete(
    harness: Awaited<ReturnType<typeof createHarness>>,
    endpoint: string,
    params: Record<string, string>,
): Promise<Response> {
    const url = new URL(`${sourcePrefix}offers/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(harness.sources, new Request(url, { method: "DELETE" }), sourceContext(harness));
}

function sourceContext(harness: {
    sourceFetch: typeof fetch;
    resolveSecret: (ref: string) => Promise<string | undefined>;
}) {
    return {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
        },
    };
}

function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    return input instanceof Request ? input : new Request(input, init);
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

function filterValue(value: string | null): { operator: string; value: string } | null {
    if (!value) return null;
    const [operator, ...rest] = value.split(".");
    return { operator: operator ?? "", value: rest.join(".") };
}

function matchesFilter(value: unknown, filter: { operator: string; value: string }): boolean {
    if (filter.operator === "eq") return same(value, filter.value);
    if (filter.operator === "ilike") {
        return String(value ?? "").toLowerCase().includes(filter.value.replaceAll("*", "").toLowerCase());
    }
    return true;
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
