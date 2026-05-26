import { describe, test, expect } from "bun:test";
import { MemoryKeyStore } from "@bernouy/issuer-kit";
import { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";

const HUB_ISS = "https://hub.example";
const TP_URL  = "https://delivery.acme.example";

function makeFakeDpFetch(opts: {
    providerId?:         string;
    contractVersion?:    string;
    issBaseUrl?:         string;
    jwksUri?:            string;
    refuseAdmin?:        boolean;
    rejectAdminTenants?: boolean;
    failLogs?:           boolean;
} = {}): typeof fetch {
    const providerId      = opts.providerId      ?? "delivery-acme";
    const contractVersion = opts.contractVersion ?? "1.0";
    const issBase         = opts.issBaseUrl      ?? TP_URL;
    const jwksUri         = opts.jwksUri         ?? `${TP_URL}/jwks.json`;

    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url    = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";

        if (url === `${TP_URL}/.well-known/tenant-provisioner-info`) {
            return new Response(JSON.stringify({
                providerId, providerKind: "delivery", contractVersion,
                defaultDeprovisionPolicy: { mode: "immediate" },
            }), { status: 200 });
        }
        if (url === `${TP_URL}/.well-known/oauth-authorization-server`) {
            return new Response(JSON.stringify({
                issuer: issBase, jwks_uri: jwksUri,
                signing_alg_values_supported: ["ES256"],
                tenant_provisioner_contract_version: contractVersion,
            }), { status: 200 });
        }
        if (url === `${TP_URL}/jwks.json`) {
            return new Response(JSON.stringify({ keys: [] }), { status: 200 });
        }
        if (url === `${TP_URL}/openapi.admin.json`) {
            if (opts.refuseAdmin) return new Response(JSON.stringify({ ok: false }), { status: 401 });
            return new Response(JSON.stringify({ openapi: "3.0.3", paths: {} }), { status: 200 });
        }
        if (url === `${TP_URL}/openapi.tenant-config.json`) {
            return new Response(JSON.stringify({ version: "1.0", properties: {} }), { status: 200 });
        }
        if (url.startsWith(`${TP_URL}/admin/tenants`) && method === "POST") {
            if (opts.rejectAdminTenants) return new Response("forbidden", { status: 403 });
            return new Response(JSON.stringify({ tenantId: "acme", issuers: ["https://idp.example/realms/acme"], role: "tenant", status: "active" }), { status: 200 });
        }
        if (url.startsWith(`${TP_URL}/admin/tenants`) && method === "DELETE") {
            return new Response(null, { status: 204 });
        }
        if (url.startsWith(`${TP_URL}/admin/tenants`) && method === "PATCH") {
            return new Response(JSON.stringify({ tenantId: "acme", status: "active" }), { status: 200 });
        }
        if (url.startsWith(`${TP_URL}/admin/config`) && method === "GET") {
            return new Response(JSON.stringify({ version: "1.0", config: { x: 1 } }), { status: 200 });
        }
        if (url.startsWith(`${TP_URL}/admin/logs`) && method === "GET") {
            if (opts.failLogs) return new Response("boom", { status: 503 });
            return new Response(JSON.stringify({ items: [{ ts: "2026-01-01T00:00:00.000Z", event: "request.served" }] }), { status: 200 });
        }
        return new Response("unexpected " + method + " " + url, { status: 500 });
    }) as unknown as typeof fetch;
}

function makeHub(fetchImpl: typeof fetch): Hub {
    return new Hub({
        issuer: { baseUrl: HUB_ISS, keyStore: new MemoryKeyStore({ now: () => Math.floor(Date.now() / 1000), keyOverlapSeconds: 300 }) },
        fetch:  fetchImpl,
    });
}

describe("TP registry — happy paths", () => {
    test("importTenantProvisioner fetches + persists", async () => {
        const hub = makeHub(makeFakeDpFetch());
        const dp = await hub.importTenantProvisioner({ url: TP_URL, name: "Acme Delivery" });
        expect(dp.providerId).toBe("delivery-acme");
        expect(dp.providerKind).toBe("delivery");
        expect(dp.iss).toBe(TP_URL);
        expect(dp.schemas.tenantConfig?.version).toBe("1.0");
    });

    test("duplicate import → duplicate_provider_id", async () => {
        const hub = makeHub(makeFakeDpFetch());
        await hub.importTenantProvisioner({ url: TP_URL });
        try { await hub.importTenantProvisioner({ url: TP_URL }); throw new Error("nope"); }
        catch (e) { expect((e as HubError).code).toBe("duplicate_provider_id"); }
    });

    test("unimport removes the row", async () => {
        const hub = makeHub(makeFakeDpFetch());
        await hub.importTenantProvisioner({ url: TP_URL });
        await hub.unimportTenantProvisioner("delivery-acme");
        expect(await hub.getTenantProvisioner("delivery-acme")).toBeNull();
    });
});

describe("Namespace registry + tenants", () => {
    test("createNamespace + createTenant relays POST + persists tenant", async () => {
        const hub = makeHub(makeFakeDpFetch());
        await hub.importTenantProvisioner({ url: TP_URL });
        await hub.createNamespace({ namespaceId: "acme", displayName: "ACME Corp" });
        const t = await hub.createTenant("acme", "delivery-acme", {
            tenantId: "acme-delivery-1",
            issuers: ["https://idp.example/realms/acme"],
            providerConfig: { x: 1 },
        });
        expect(t.tenantId).toBe("acme-delivery-1");
        expect(t.namespaceId).toBe("acme");
        expect(t.providerId).toBe("delivery-acme");
        expect(t.issuers).toEqual(["https://idp.example/realms/acme"]);
        expect(t.config).toEqual({ x: 1 });
    });

    test("multiple tenants of the same TP per namespace", async () => {
        const hub = makeHub(makeFakeDpFetch());
        await hub.importTenantProvisioner({ url: TP_URL });
        await hub.createNamespace({ namespaceId: "acme", displayName: "ACME Corp" });
        await hub.createTenant("acme", "delivery-acme", { tenantId: "t-a", issuers: [] });
        await hub.createTenant("acme", "delivery-acme", { tenantId: "t-b", issuers: [] });
        const list = await hub.listTenants("acme");
        expect(list.map((t) => t.tenantId)).toEqual(["t-a", "t-b"]);
    });

    test("createTenant with empty issuers is allowed", async () => {
        const hub = makeHub(makeFakeDpFetch());
        await hub.importTenantProvisioner({ url: TP_URL });
        await hub.createNamespace({ namespaceId: "acme", displayName: "ACME Corp" });
        const t = await hub.createTenant("acme", "delivery-acme", { issuers: [] });
        expect(t.issuers).toEqual([]);
    });

    test("create on unknown namespace → namespace_not_found", async () => {
        const hub = makeHub(makeFakeDpFetch());
        await hub.importTenantProvisioner({ url: TP_URL });
        try {
            await hub.createTenant("ghost", "delivery-acme", { issuers: [] });
            throw new Error("nope");
        } catch (e) { expect((e as HubError).code).toBe("namespace_not_found"); }
    });

    test("create on unknown TP → provider_not_found", async () => {
        const hub = makeHub(makeFakeDpFetch());
        await hub.createNamespace({ namespaceId: "acme", displayName: "ACME" });
        try {
            await hub.createTenant("acme", "ghost", { issuers: [] });
            throw new Error("nope");
        } catch (e) { expect((e as HubError).code).toBe("provider_not_found"); }
    });

    test("removeTenant relays DELETE + drops row", async () => {
        const hub = makeHub(makeFakeDpFetch());
        await hub.importTenantProvisioner({ url: TP_URL });
        await hub.createNamespace({ namespaceId: "acme", displayName: "ACME" });
        await hub.createTenant("acme", "delivery-acme", { tenantId: "t-x", issuers: [] });
        await hub.removeTenant("t-x", { force: true });
        expect(await hub.getTenant("t-x")).toBeNull();
    });

    test("deleteNamespace cascades", async () => {
        const hub = makeHub(makeFakeDpFetch());
        await hub.importTenantProvisioner({ url: TP_URL });
        await hub.createNamespace({ namespaceId: "acme", displayName: "ACME" });
        await hub.createTenant("acme", "delivery-acme", { tenantId: "t-x", issuers: [] });
        await hub.deleteNamespace("acme");
        expect(await hub.getNamespace("acme")).toBeNull();
        expect(await hub.getTenant("t-x")).toBeNull();
    });
});

describe("Namespace logs — partial failure", () => {
    async function seedNs(fetchImpl: typeof fetch): Promise<Hub> {
        const hub = makeHub(fetchImpl);
        await hub.importTenantProvisioner({ url: TP_URL });
        await hub.createNamespace({ namespaceId: "acme", displayName: "ACME" });
        await hub.createTenant("acme", "delivery-acme", { tenantId: "t-x", issuers: [] });
        return hub;
    }

    test("aggregates tenant logs, no failedProviders on success", async () => {
        const hub = await seedNs(makeFakeDpFetch());
        const page = await hub.fetchNamespaceLogs("acme", {});
        expect(page.items.length).toBe(1);
        expect(page.failedProviders).toBeUndefined();
    });

    test("a TP failing /admin/logs → partial result + failedProviders, no throw", async () => {
        const hub = await seedNs(makeFakeDpFetch({ failLogs: true }));
        const page = await hub.fetchNamespaceLogs("acme", {});
        expect(page.items).toEqual([]);
        expect(page.failedProviders).toEqual(["delivery-acme"]);
    });
});

describe("TP registry — error paths", () => {
    test("TP refuses admin → provider_does_not_trust_hub", async () => {
        const hub = makeHub(makeFakeDpFetch({ refuseAdmin: true }));
        try { await hub.importTenantProvisioner({ url: TP_URL }); throw new Error("nope"); }
        catch (e) { expect((e as HubError).code).toBe("provider_does_not_trust_hub"); }
    });

    test("cross-origin jwks_uri rejected (anti-SSRF) → provider_metadoc_invalid", async () => {
        const hub = makeHub(makeFakeDpFetch({ jwksUri: "http://169.254.169.254/latest/meta-data" }));
        try { await hub.importTenantProvisioner({ url: TP_URL }); throw new Error("nope"); }
        catch (e) { expect((e as HubError).code).toBe("provider_metadoc_invalid"); }
    });

    test("major contract mismatch → provider_metadoc_invalid", async () => {
        const hub = makeHub(makeFakeDpFetch({ contractVersion: "2.5" }));
        try { await hub.importTenantProvisioner({ url: TP_URL }); throw new Error("nope"); }
        catch (e) { expect((e as HubError).code).toBe("provider_metadoc_invalid"); }
    });

    test("activate TP returns non-2xx → provider_rejected_provisioning", async () => {
        const hub = makeHub(makeFakeDpFetch({ rejectAdminTenants: true }));
        await hub.importTenantProvisioner({ url: TP_URL });
        await hub.createNamespace({ namespaceId: "acme", displayName: "ACME" });
        try {
            await hub.createTenant("acme", "delivery-acme", { issuers: [] });
            throw new Error("nope");
        } catch (e) { expect((e as HubError).code).toBe("provider_rejected_provisioning"); }
    });
});
