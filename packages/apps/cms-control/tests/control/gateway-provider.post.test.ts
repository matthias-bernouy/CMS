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

    test("query params persist as endpoint.input.params", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post(validBody({
            "endpoints.0.params.0.name": "limit", "endpoints.0.params.0.in": "query",
            "endpoints.0.params.0.type": "number", "endpoints.0.params.0.required": "true",
        })), cms);
        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints[0]!.input?.params).toEqual([
            { name: "limit", in: "query", required: true, schema: { type: "number" } },
        ]);
    });

    test("params are isolated per endpoint (no cross-contamination)", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post({
            id: "shop", "meta.name": "Shop",
            "endpoints.0.endpointId": "a", "endpoints.0.method": "GET", "endpoints.0.targetUrl": "https://x.com/a",
            "endpoints.0.params.0.name": "p0", "endpoints.0.params.0.in": "query", "endpoints.0.params.0.type": "string",
            "endpoints.1.endpointId": "b", "endpoints.1.method": "GET", "endpoints.1.targetUrl": "https://x.com/b",
            "endpoints.1.params.0.name": "p1", "endpoints.1.params.0.in": "query", "endpoints.1.params.0.type": "number", "endpoints.1.params.0.required": "true",
        }), cms);
        const s = await gateway.getProvider("urn:shop");
        expect(s?.endpoints[0]!.input?.params?.map(p => p.name)).toEqual(["p0"]);
        expect(s?.endpoints[1]!.input?.params).toEqual([
            { name: "p1", in: "query", required: true, schema: { type: "number" } },
        ]);
    });
});
