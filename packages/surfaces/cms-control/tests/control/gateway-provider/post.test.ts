import { describe, test, expect } from "bun:test";
import postGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.post";
import { DuplicateSourceError, InMemorySourceRepository, ValidatingSourceRepository } from "@bernouy/cms-sources";

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

describe("POST /api/gateway-provider", () => {
    test("happy path: a 2-endpoint provider persists and is readable", async () => {
        const { cms, gateway } = makeCms();
        const res = await postGatewayProvider(post({
            id: "shop", "meta.name": "Shop",
            "endpoints.0.endpointId": "getCart", "endpoints.0.method": "GET",  "endpoints.0.targetUrl": "https://api.shop.com/cart",
            "endpoints.1.endpointId": "addItem", "endpoints.1.method": "POST", "endpoints.1.targetUrl": "https://api.shop.com/items",
        }), cms);
        expect(res.ok).toBe(true);

        const stored = await gateway.getSource("urn:shop");
        expect(stored?.endpoints).toHaveLength(2);
        expect(stored?.endpoints[0]!.urn).toBe("urn:shop:getCart");
        expect(stored?.endpoints[1]!.urn).toBe("urn:shop:addItem");
    });

    test("duplicate urn -> domain error with HTTP status", async () => {
        const { cms } = makeCms();
        await postGatewayProvider(post(validBody()), cms);
        await expect(postGatewayProvider(post(validBody()), cms)).rejects.toBeInstanceOf(DuplicateSourceError);
        await expect(postGatewayProvider(post(validBody()), cms)).rejects.toMatchObject({ status: 400 });
    });

    test("bad method -> throws", async () => {
        const { cms } = makeCms();
        await expect(postGatewayProvider(post(validBody({ "endpoints.0.method": "FETCH" })), cms))
            .rejects.toThrow(/endpoints\.0\.method/);
    });

    test("query params persist as endpoint.input.params", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post(validBody({
            "endpoints.0.params": JSON.stringify([{ name: "limit", in: "query", type: "number", required: true }]),
        })), cms);
        expect((await gateway.getSource("urn:shop"))?.endpoints[0]!.input?.params).toEqual([
            { name: "limit", in: "query", required: true, schema: { type: "number" } },
        ]);
    });

    test("body shape persists as endpoint.input.body", async () => {
        const { cms, gateway } = makeCms();
        const body = { type: "object", properties: { id: { type: "string" }, tags: { type: "array", items: { type: "string" } } } };
        await postGatewayProvider(post(validBody({ "endpoints.0.method": "POST", "endpoints.0.body": JSON.stringify(body) })), cms);
        expect((await gateway.getSource("urn:shop"))?.endpoints[0]!.input?.body).toEqual(body as any);
    });

    test("body required[] round-trips into input.body", async () => {
        const { cms, gateway } = makeCms();
        const body = { type: "object", properties: { id: { type: "string" }, n: { type: "number" } }, required: ["id"] };
        await postGatewayProvider(post(validBody({ "endpoints.0.method": "POST", "endpoints.0.body": JSON.stringify(body) })), cms);
        expect((await gateway.getSource("urn:shop"))?.endpoints[0]!.input?.body).toEqual(body as any);
    });

    test("body-only endpoint still gets an input.body", async () => {
        const { cms, gateway } = makeCms();
        const body = { type: "object", properties: { q: { type: "string" } } };
        await postGatewayProvider(post(validBody({ "endpoints.0.body": JSON.stringify(body) })), cms);
        const stored = await gateway.getSource("urn:shop");
        expect(stored?.endpoints[0]!.input?.params).toBeUndefined();
        expect(stored?.endpoints[0]!.input?.body).toEqual(body as any);
    });

    test("output response list round-trips", async () => {
        const { cms, gateway } = makeCms();
        const body = { type: "object", properties: { ok: { type: "boolean" } } };
        const output = [{ status: "200", body }];
        await postGatewayProvider(post(validBody({ "endpoints.0.output": JSON.stringify(output) })), cms);
        expect((await gateway.getSource("urn:shop"))?.endpoints[0]!.output).toEqual(output as any);
    });

    test("malformed body JSON -> InvalidParam", async () => {
        const { cms } = makeCms();
        await expect(postGatewayProvider(post(validBody({ "endpoints.0.body": "{not json" })), cms))
            .rejects.toThrow(/endpoints\.0\.body/);
    });

    test("reserved system provider ids are rejected", async () => {
        const { cms } = makeCms();
        await expect(postGatewayProvider(post(validBody({ id: "system-auth" })), cms))
            .rejects.toThrow(/reserved prefix/);
    });
});
