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

    test("query params (JSON blob) persist as endpoint.input.params", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post(validBody({
            "endpoints.0.params": JSON.stringify([{ name: "limit", in: "query", type: "number", required: true }]),
        })), cms);
        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints[0]!.input?.params).toEqual([
            { name: "limit", in: "query", required: true, schema: { type: "number" } },
        ]);
    });

    test("body shape persists as endpoint.input.body (nested, validated)", async () => {
        const { cms, gateway } = makeCms();
        const body = { type: "object", properties: { id: { type: "string" }, tags: { type: "array", items: { type: "string" } } } };
        await postGatewayProvider(post(validBody({
            "endpoints.0.method": "POST",
            "endpoints.0.body": JSON.stringify(body),
        })), cms);
        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints[0]!.input?.body).toEqual(body as any);
    });

    test("body `required[]` round-trips into input.body", async () => {
        const { cms, gateway } = makeCms();
        const body = { type: "object", properties: { id: { type: "string" }, n: { type: "number" } }, required: ["id"] };
        await postGatewayProvider(post(validBody({ "endpoints.0.method": "POST", "endpoints.0.body": JSON.stringify(body) })), cms);
        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints[0]!.input?.body).toEqual(body as any);
    });

    test("body-only endpoint (no params) still gets an input.body", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post(validBody({
            "endpoints.0.body": JSON.stringify({ type: "object", properties: { q: { type: "string" } } }),
        })), cms);
        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints[0]!.input?.params).toBeUndefined();
        expect(stored?.endpoints[0]!.input?.body).toEqual({ type: "object", properties: { q: { type: "string" } } } as any);
    });

    test("output response list round-trips (B1: edit never wipes it)", async () => {
        const { cms, gateway } = makeCms();
        const body = { type: "object", properties: { ok: { type: "boolean" } } };
        const output = [{ status: "200", body }];
        await postGatewayProvider(post(validBody({ "endpoints.0.output": JSON.stringify(output) })), cms);
        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints[0]!.output).toEqual(output as any);
    });

    test("malformed body JSON → InvalidParam (not a 500)", async () => {
        const { cms } = makeCms();
        await expect(postGatewayProvider(post(validBody({ "endpoints.0.body": "{not json" })), cms))
            .rejects.toThrow(/endpoints\.0\.body/);
    });

    test("query-param description round-trips (B1: edit never wipes it)", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post(validBody({
            "endpoints.0.params": JSON.stringify([{ name: "q", in: "query", type: "string", description: "Search terms" }]),
        })), cms);
        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints[0]!.input?.params?.[0]).toEqual(
            { name: "q", in: "query", required: false, schema: { type: "string" }, description: "Search terms" } as any,
        );
    });

    test("endpoint meta round-trips verbatim (B1: edit never wipes it)", async () => {
        const { cms, gateway } = makeCms();
        const meta = { name: "Get cart", description: "Returns the cart", icon: "cart" };
        await postGatewayProvider(post(validBody({ "endpoints.0.meta": JSON.stringify(meta) })), cms);
        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints[0]!.meta).toEqual(meta as any);
    });

    test("a name-less / malformed endpoint meta is DROPPED, not fatal (stays saveable)", async () => {
        const { cms, gateway } = makeCms();
        // editor-less round-trip field: a bad stored meta must not block the save.
        const res = await postGatewayProvider(post(validBody({ "endpoints.0.meta": JSON.stringify({ icon: "x" }) })), cms);
        expect(res.ok).toBe(true);
        const stored = await gateway.getProvider("urn:shop");
        expect(stored?.endpoints[0]!.meta).toBeUndefined();
    });

    test("params are isolated per endpoint (no cross-contamination)", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post({
            id: "shop", "meta.name": "Shop",
            "endpoints.0.endpointId": "a", "endpoints.0.method": "GET", "endpoints.0.targetUrl": "https://x.com/a",
            "endpoints.0.params": JSON.stringify([{ name: "p0", in: "query", type: "string" }]),
            "endpoints.1.endpointId": "b", "endpoints.1.method": "GET", "endpoints.1.targetUrl": "https://x.com/b",
            "endpoints.1.params": JSON.stringify([{ name: "p1", in: "query", type: "number", required: true }]),
        }), cms);
        const s = await gateway.getProvider("urn:shop");
        expect(s?.endpoints[0]!.input?.params?.map(p => p.name)).toEqual(["p0"]);
        expect(s?.endpoints[1]!.input?.params).toEqual([
            { name: "p1", in: "query", required: true, schema: { type: "number" } },
        ]);
    });
});
