import { describe, test, expect } from "bun:test";
import { InMemoryGatewayRepository } from "cms-gateway/default-implementation/GatewayRepository/memory";
import type { Provider } from "cms-gateway/interfaces/Gateway";

const provider = (): Provider => ({
    urn: "urn:shop",
    meta: { name: "Shop" },
    endpoints: [
        { urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart", rules: [] },
    ],
});

describe("InMemoryGatewayRepository", () => {
    test("create + getProvider", async () => {
        const r = new InMemoryGatewayRepository();
        await r.createProvider(provider());
        const p = await r.getProvider("urn:shop");
        expect(p?.urn).toBe("urn:shop");
        expect(p?.endpoints).toHaveLength(1);
    });

    test("rejects a duplicate urn", async () => {
        const r = new InMemoryGatewayRepository();
        await r.createProvider(provider());
        await expect(r.createProvider(provider())).rejects.toThrow(/already exists/);
    });

    test("getProvider miss → null", async () => {
        const r = new InMemoryGatewayRepository();
        expect(await r.getProvider("urn:nope")).toBeNull();
    });

    test("getAllProviders", async () => {
        const r = new InMemoryGatewayRepository();
        await r.createProvider(provider());
        expect(await r.getAllProviders()).toHaveLength(1);
    });

    test("getEndpoint hit / miss", async () => {
        const r = new InMemoryGatewayRepository();
        await r.createProvider(provider());
        expect((await r.getEndpoint("urn:shop:getCart"))?.method).toBe("GET");
        expect(await r.getEndpoint("urn:shop:nope")).toBeNull();
    });

    test("defensive clone — mutating a read result doesn't corrupt the store", async () => {
        const r = new InMemoryGatewayRepository();
        await r.createProvider(provider());
        const p1 = await r.getProvider("urn:shop");
        p1!.endpoints.push({ urn: "urn:shop:injected", method: "GET", targetUrl: "https://x.com", rules: [] });
        p1!.meta!.name = "HACKED";
        const p2 = await r.getProvider("urn:shop");
        expect(p2?.endpoints).toHaveLength(1);
        expect(p2?.meta?.name).toBe("Shop");
    });

    test("defensive clone — mutating the input after create doesn't corrupt the store", async () => {
        const r = new InMemoryGatewayRepository();
        const input = provider();
        await r.createProvider(input);
        input.endpoints.push({ urn: "urn:shop:injected", method: "GET", targetUrl: "https://x.com", rules: [] });
        expect((await r.getProvider("urn:shop"))?.endpoints).toHaveLength(1);
    });
});
