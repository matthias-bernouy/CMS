import { describe, test, expect } from "bun:test";
import { ValidatingGatewayRepository } from "cms-gateway/core/ValidatingGatewayRepository";
import { InMemoryGatewayRepository } from "cms-gateway/default-implementation/InMemoryGatewayRepository";
import { GatewayValidationError } from "cms-gateway/core/errors";
import type { Provider } from "cms-gateway/interfaces/Gateway";

const valid = (): Provider => ({
    urn: "urn:shop",
    meta: { name: "Shop" },
    endpoints: [{ urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" }],
});

const repo = () => new ValidatingGatewayRepository(new InMemoryGatewayRepository());

describe("ValidatingGatewayRepository", () => {
    test("valid create delegates and persists", async () => {
        const r = repo();
        await r.createProvider(valid());
        expect((await r.getProvider("urn:shop"))?.endpoints).toHaveLength(1);
    });

    test("invalid create rejects with GatewayValidationError (.status 400), nothing stored", async () => {
        const r = repo();
        const bad = { ...valid(), endpoints: [{ urn: "urn:other:x", method: "GET" as const, targetUrl: "https://x.com" }] };
        await expect(r.createProvider(bad)).rejects.toBeInstanceOf(GatewayValidationError);
        await expect(r.createProvider(bad)).rejects.toMatchObject({ status: 400 });
        expect(await r.getProvider("urn:shop")).toBeNull();
    });

    test("invalid update rejects — the rule is unbypassable on BOTH writes", async () => {
        const r = repo();
        await r.createProvider(valid());
        const bad = { ...valid(), endpoints: [{ urn: "urn:shop:x", method: "FETCH" as any, targetUrl: "https://x.com" }] };
        await expect(r.updateProvider(bad)).rejects.toBeInstanceOf(GatewayValidationError);
    });

    test("valid update delegates (null for an unknown urn passes through)", async () => {
        const r = repo();
        expect(await r.updateProvider(valid())).toBeNull();
        await r.createProvider(valid());
        expect((await r.updateProvider(valid()))?.urn).toBe("urn:shop");
    });

    test("reads and deletes pass straight through", async () => {
        const r = repo();
        await r.createProvider(valid());
        expect(await r.getEndpoint("urn:shop:getCart")).not.toBeNull();
        expect(await r.getAllProviders()).toHaveLength(1);
        expect(await r.deleteProvider("urn:shop")).toBe(true);
        expect(await r.getAllProviders()).toHaveLength(0);
    });
});
