import { describe, test, expect, spyOn } from "bun:test";
import type { Runner, RouteHandler } from "@bernouy/core";
import { registerGatewayEndpoint } from "@bernouy/cms-gateway";
import { InMemoryGatewayRepository, seedProviders } from "@bernouy/cms-gateway";
import type { Provider } from "@bernouy/cms-gateway";
import { InMemorySecretStore } from "@bernouy/cms-secrets";

// A provider whose endpoint injects a `secret`-sourced header — exercises the
// wired `resolveSecret` (delivery leaves it unwired, so it can't cover this).
const SECURED: Provider = {
    urn: "urn:secured",
    endpoints: [{
        urn: "urn:secured:get", method: "GET", targetUrl: "https://api.example.com/data",
        headers: [{ name: "authorization", source: { from: "secret", ref: "API_KEY" } }],
    }],
};

/**
 * Minimal `Runner` stand-in: captures the default endpoint each method registers
 * inside the `/.cms/gateway` group, so a test can invoke the REAL handler the
 * helper wired — exercising `handleGatewayRequest` end-to-end without booting a
 * server. (Delivery mounts the same `registerGatewayEndpoint` without `deps`.)
 */
function captureRunner() {
    const handlers = new Map<string, RouteHandler>();
    const runner = {
        basePath: "/cms",
        group(_prefix: string, cb: (r: Runner) => void) {
            cb({ setDefaultEndpoint: (m: string, h: RouteHandler) => handlers.set(m, h) } as unknown as Runner);
        },
    } as unknown as Runner;
    return { runner, handlers };
}

async function mountBan() {
    const gateway = new InMemoryGatewayRepository();
    const { BAN_PROVIDER } = await import("@bernouy/cms-gateway/presets");
    await seedProviders(gateway, [BAN_PROVIDER]);
    const secrets = new InMemorySecretStore();
    const { runner, handlers } = captureRunner();
    registerGatewayEndpoint({ runner, gateway, deps: { resolveSecret: (r) => secrets.get(r).then(v => v ?? undefined) } });
    return { handlers, secrets, gateway };
}

const URL_BASE = "http://admin/cms/.cms/gateway";

describe("registerGatewayEndpoint (control preview proxy)", () => {
    test("registers all five proxy methods", async () => {
        const { handlers } = await mountBan();
        expect([...handlers.keys()].sort()).toEqual(["DELETE", "GET", "PATCH", "POST", "PUT"]);
    });

    test("resolves a provider/endpoint and proxies to the built upstream URL", async () => {
        const { handlers } = await mountBan();
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
            new Response('{"type":"FeatureCollection"}', { status: 200, headers: { "content-type": "application/json" } }),
        );
        try {
            const res = await handlers.get("GET")!(new Request(`${URL_BASE}/ban/search?q=8+bd+du+port`));
            expect(res.status).toBe(200);
            expect(String(fetchSpy.mock.calls[0]![0])).toBe("https://api-adresse.data.gouv.fr/search/?q=8+bd+du+port");
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("a {from:'secret'} header resolves via cms.secrets and reaches the upstream", async () => {
        const gateway = new InMemoryGatewayRepository();
        await seedProviders(gateway, [SECURED]);
        const secrets = new InMemorySecretStore();
        await secrets.set("API_KEY", "s3cr3t-token");
        const { runner, handlers } = captureRunner();
        registerGatewayEndpoint({ runner, gateway, deps: { resolveSecret: (r) => secrets.get(r).then(v => v ?? undefined) } });

        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
        try {
            const res = await handlers.get("GET")!(new Request(`${URL_BASE}/secured/get`));
            expect(res.status).toBe(200);
            const init = fetchSpy.mock.calls[0]![1] as RequestInit;
            expect((init.headers as Headers).get("authorization")).toBe("s3cr3t-token");
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("missing secret → clean 500 (resolveSecret returns undefined, never throws), no upstream call", async () => {
        const gateway = new InMemoryGatewayRepository();
        await seedProviders(gateway, [SECURED]);
        const secrets = new InMemorySecretStore(); // API_KEY absent
        const { runner, handlers } = captureRunner();
        registerGatewayEndpoint({ runner, gateway, deps: { resolveSecret: (r) => secrets.get(r).then(v => v ?? undefined) } });

        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("x"));
        try {
            const res = await handlers.get("GET")!(new Request(`${URL_BASE}/secured/get`));
            expect(res.status).toBe(500);
            expect(await res.text()).toContain("secret introuvable");
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("unknown provider/endpoint → 404, no upstream call", async () => {
        const { handlers } = await mountBan();
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("x"));
        try {
            const res = await handlers.get("GET")!(new Request(`${URL_BASE}/ban/nope`));
            expect(res.status).toBe(404);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("path not under the base-path prefix → 404", async () => {
        const { handlers } = await mountBan();
        // Same path but at the root origin (no /cms base) — must NOT match.
        const res = await handlers.get("GET")!(new Request("http://admin/.cms/gateway/ban/search?q=x"));
        expect(res.status).toBe(404);
    });

    test("no gateway configured → 501", async () => {
        const secrets = new InMemorySecretStore();
        const { runner, handlers } = captureRunner();
        registerGatewayEndpoint({ runner, gateway: null, deps: { resolveSecret: (r) => secrets.get(r).then(v => v ?? undefined) } });
        const res = await handlers.get("GET")!(new Request(`${URL_BASE}/ban/search?q=x`));
        expect(res.status).toBe(501);
    });
});
