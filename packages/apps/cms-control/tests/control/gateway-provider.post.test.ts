import { describe, test, expect } from "bun:test";
import postGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.post";
import { InMemoryGatewayRepository } from "@bernouy/cms-gateway";

const makeCms = () => {
    const gateway = new InMemoryGatewayRepository();
    return { cms: { gateway } as any, gateway };
};

const post = (body: Record<string, unknown>) =>
    new Request("http://localhost/cms/api/gateway-provider", {
        method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
    });

const validBody = (over: Record<string, unknown> = {}) => ({
    id: "shop", "meta.name": "Shop",
    "endpoints.0.endpointId": "getCart", "endpoints.0.method": "GET", "endpoints.0.targetUrl": "https://api.shop.com/cart",
    ...over,
});

describe("POST /api/gateway-provider", () => {
    test("happy path: a 2-endpoint provider persists and is readable", async () => {
        const { cms, gateway } = makeCms();
        const res = await postGatewayProvider(post({
            id: "shop", "meta.name": "Shop",
            "endpoints.0.endpointId": "getCart", "endpoints.0.method": "GET",  "endpoints.0.targetUrl": "https://api.shop.com/cart",
            "endpoints.1.endpointId": "addItem", "endpoints.1.method": "POST", "endpoints.1.targetUrl": "https://api.shop.com/items",
        }), cms);
        expect(res.ok).toBe(true);

        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints).toHaveLength(2);
        expect(stored?.endpoints[0]!.urn).toBe("urn:shop:getCart");
        expect(stored?.endpoints[1]!.urn).toBe("urn:shop:addItem");
        expect(stored?.endpoints[0]!.rules).toEqual([]);
    });

    test("duplicate urn → InvalidParam (mapped, not a 500)", async () => {
        const { cms } = makeCms();
        await postGatewayProvider(post(validBody()), cms);
        await expect(postGatewayProvider(post(validBody()), cms)).rejects.toThrow(/Invalid param urn/);
    });

    test("bad method → throws", async () => {
        const { cms } = makeCms();
        await expect(postGatewayProvider(post(validBody({ "endpoints.0.method": "FETCH" })), cms))
            .rejects.toThrow(/endpoints\.0\.method/);
    });
});
