import { describe, expect, test } from "bun:test";
import { CompositeGatewayRepository } from "cms-gateway/core/CompositeGatewayRepository";
import { InMemoryGatewayRepository } from "cms-gateway/default-implementation/InMemoryGatewayRepository";
import { SYSTEM_AUTH_PROVIDER, SYSTEM_AUTH_PROVIDER_URN } from "cms-gateway/core/systemProviders";
import type { Provider } from "cms-gateway/interfaces/Gateway";

const provider = (urn = "urn:shop"): Provider => ({
    urn,
    meta: { name: "Shop" },
    endpoints: [
        { urn: `${urn}:getCart`, method: "GET", targetUrl: "https://api.shop.com/cart" },
    ],
});

describe("CompositeGatewayRepository", () => {
    test("lists system providers before persisted providers", async () => {
        const inner = new InMemoryGatewayRepository();
        await inner.createProvider(provider());
        const repo = new CompositeGatewayRepository(inner, [SYSTEM_AUTH_PROVIDER]);

        const providers = await repo.getAllProviders();
        expect(providers.map(p => p.urn)).toEqual([SYSTEM_AUTH_PROVIDER_URN, "urn:shop"]);
    });

    test("resolves system providers and endpoints without persisting them", async () => {
        const inner = new InMemoryGatewayRepository();
        const repo = new CompositeGatewayRepository(inner, [SYSTEM_AUTH_PROVIDER]);

        expect(await inner.getProvider(SYSTEM_AUTH_PROVIDER_URN)).toBeNull();
        expect((await repo.getProvider(SYSTEM_AUTH_PROVIDER_URN))?.meta?.name).toBe("Authentication");
        expect((await repo.getEndpoint("urn:system-auth:login"))?.targetUrl).toBe("cms-system://auth/login");
    });

    test("blocks writes in the reserved system namespace", async () => {
        const repo = new CompositeGatewayRepository(new InMemoryGatewayRepository(), [SYSTEM_AUTH_PROVIDER]);

        await expect(repo.createProvider(provider("urn:system-custom"))).rejects.toThrow(/reserved/);
        await expect(repo.updateProvider(SYSTEM_AUTH_PROVIDER)).rejects.toThrow(/readonly/);
        await expect(repo.deleteProvider(SYSTEM_AUTH_PROVIDER_URN)).rejects.toThrow(/readonly/);
    });

    test("filters legacy persisted system providers from read lists", async () => {
        const inner = new InMemoryGatewayRepository();
        await inner.createProvider(provider("urn:system-legacy"));
        const repo = new CompositeGatewayRepository(inner, [SYSTEM_AUTH_PROVIDER]);

        expect((await repo.getAllProviders()).map(p => p.urn)).toEqual([SYSTEM_AUTH_PROVIDER_URN]);
    });
});
