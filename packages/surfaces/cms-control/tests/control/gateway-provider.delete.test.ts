import { describe, test, expect } from "bun:test";
import postGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.post";
import deleteGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.delete";
import { CompositeGatewayRepository, InMemoryGatewayRepository, SYSTEM_AUTH_PROVIDER_URN, SYSTEM_GATEWAY_PROVIDERS } from "@bernouy/cms-gateway";

const makeCms = () => {
    const gateway = new InMemoryGatewayRepository();
    return { cms: { gateway } as any, gateway };
};

const seed = (cms: any) => postGatewayProvider(
    new Request("http://localhost/cms/api/gateway-provider", {
        method: "POST",
        body: JSON.stringify({
            id: "shop", "meta.name": "Shop",
            "endpoints.0.endpointId": "getCart", "endpoints.0.method": "GET", "endpoints.0.targetUrl": "https://api.shop.com/cart",
        }),
        headers: { "content-type": "application/json" },
    }),
    cms,
);

const del = (qs: string) =>
    new Request("http://localhost/cms/api/gateway-provider" + qs, { method: "DELETE" });

describe("DELETE /api/gateway-provider", () => {
    test("removes the provider", async () => {
        const { cms, gateway } = makeCms();
        await seed(cms);
        const res = await deleteGatewayProvider(del("?urn=urn:shop"), cms);
        expect(res.status).toBe(200);
        expect(await gateway.getProvider("urn:shop")).toBeNull();
    });

    test("unknown urn → InvalidParam", async () => {
        const { cms } = makeCms();
        await expect(deleteGatewayProvider(del("?urn=urn:nope"), cms)).rejects.toThrow(/Invalid param urn/);
    });

    test("missing urn param → MissingParam", async () => {
        const { cms } = makeCms();
        await expect(deleteGatewayProvider(del(""), cms)).rejects.toThrow(/Missing param urn/);
    });

    test("system providers are readonly", async () => {
        const gateway = new CompositeGatewayRepository(new InMemoryGatewayRepository(), SYSTEM_GATEWAY_PROVIDERS);
        const cms = { gateway } as any;
        await expect(deleteGatewayProvider(del(`?urn=${SYSTEM_AUTH_PROVIDER_URN}`), cms)).rejects.toThrow(/readonly/);
    });
});
