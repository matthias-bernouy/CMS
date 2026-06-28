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

describe("POST /api/gateway-provider OpenAPI import", () => {
    test("file content imports endpoints at creation", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post({
            id: "shop",
            "meta.name": "Shop override",
            openapi: JSON.stringify({
                openapi: "3.0.0",
                info: { title: "Shop API", version: "1" },
                servers: [{ url: "https://api.shop.com" }],
                paths: { "/cart/{id}": { get: {
                    operationId: "getCart",
                    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                    responses: { "200": { content: { "application/json": { schema: { type: "object" } } } } },
                } } },
            }),
        }), cms);
        const stored = await gateway.getSource("urn:shop");
        expect(stored?.meta?.name).toBe("Shop override");
        expect(stored?.endpoints[0]!.urn).toBe("urn:shop:get-cart");
        expect(stored?.endpoints[0]!.targetUrl).toBe("https://api.shop.com/cart/{id}");
    });

    test("accepts a base URL override", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(post({
            id: "shop",
            openapi: JSON.stringify({ openapi: "3.0.0", paths: { "/cart": { get: { operationId: "cart" } } } }),
            "openapi.baseUrl": "https://override.shop.com",
        }), cms);
        expect((await gateway.getSource("urn:shop"))?.endpoints[0]!.targetUrl)
            .toBe("https://override.shop.com/cart");
    });
});
