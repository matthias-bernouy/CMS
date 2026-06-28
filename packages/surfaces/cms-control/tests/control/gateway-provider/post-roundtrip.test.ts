import { describe, test, expect } from "bun:test";
import postGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.post";
import { InMemorySourceRepository, ValidatingSourceRepository } from "@bernouy/cms-sources";

const makeCms = () => {
    const gateway = new ValidatingSourceRepository(new InMemorySourceRepository());
    return { cms: { sources: gateway } as any, gateway };
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

describe("POST /api/gateway-provider round-trips", () => {
    test("query-param description round-trips", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post(validBody({
            "endpoints.0.params": JSON.stringify([{ name: "q", in: "query", type: "string", description: "Search terms" }]),
        })), cms);
        expect((await gateway.getSource("urn:shop"))?.endpoints[0]!.input?.params?.[0]).toEqual(
            { name: "q", in: "query", required: false, schema: { type: "string" }, description: "Search terms" } as any,
        );
    });

    test("request headers round-trip verbatim", async () => {
        const { cms, gateway } = makeCms();
        const headers = [
            { name: "X-Api-Version", source: { from: "static", value: "2024-01" } },
            { name: "Authorization", source: { from: "secret", ref: "${STRIPE_KEY}", prefix: "Bearer " } },
        ];
        await postGatewayProvider(post(validBody({ "endpoints.0.headers": JSON.stringify(headers) })), cms);
        const stored = await gateway.getSource("urn:shop");
        expect(stored?.endpoints[0]!.headers).toEqual(headers as any);
        expect((stored?.endpoints[0] as any).rules).toBeUndefined();
    });

    test("endpoint meta round-trips verbatim", async () => {
        const { cms, gateway } = makeCms();
        const meta = { name: "Get cart", description: "Returns the cart", icon: "cart" };
        await postGatewayProvider(post(validBody({ "endpoints.0.meta": JSON.stringify(meta) })), cms);
        expect((await gateway.getSource("urn:shop"))?.endpoints[0]!.meta).toEqual(meta as any);
    });

    test("name-less endpoint meta is dropped, not fatal", async () => {
        const { cms, gateway } = makeCms();
        const res = await postGatewayProvider(post(validBody({ "endpoints.0.meta": JSON.stringify({ icon: "x" }) })), cms);
        expect(res.ok).toBe(true);
        expect((await gateway.getSource("urn:shop"))?.endpoints[0]!.meta).toBeUndefined();
    });

    test("params are isolated per endpoint", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post({
            id: "shop", "meta.name": "Shop",
            "endpoints.0.endpointId": "a", "endpoints.0.method": "GET", "endpoints.0.targetUrl": "https://x.com/a",
            "endpoints.0.params": JSON.stringify([{ name: "p0", in: "query", type: "string" }]),
            "endpoints.1.endpointId": "b", "endpoints.1.method": "GET", "endpoints.1.targetUrl": "https://x.com/b",
            "endpoints.1.params": JSON.stringify([{ name: "p1", in: "query", type: "number", required: true }]),
        }), cms);
        const stored = await gateway.getSource("urn:shop");
        expect(stored?.endpoints[0]!.input?.params?.map(p => p.name)).toEqual(["p0"]);
        expect(stored?.endpoints[1]!.input?.params).toEqual([
            { name: "p1", in: "query", required: true, schema: { type: "number" } },
        ]);
    });
});
