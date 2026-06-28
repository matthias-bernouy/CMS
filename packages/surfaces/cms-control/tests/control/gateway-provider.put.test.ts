import { describe, test, expect } from "bun:test";
import postGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.post";
import putGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.put";
import { InMemorySourceRepository, ValidatingSourceRepository } from "@bernouy/cms-sources";

// Decorated like the composition roots — the domain rules live in the repo seam.
const makeCms = () => {
    const gateway = new ValidatingSourceRepository(new InMemorySourceRepository());
    return { cms: { sources: gateway } as any, gateway };
};

const body = (method: string, b: Record<string, unknown>) =>
    new Request("http://localhost/cms/api/gateway-provider", {
        method, body: JSON.stringify(b), headers: { "content-type": "application/json" },
    });

const oneEndpoint = {
    id: "shop", "meta.name": "Shop",
    "endpoints.0.endpointId": "getCart", "endpoints.0.method": "GET", "endpoints.0.targetUrl": "https://api.shop.com/cart",
};
const twoEndpoints = {
    ...oneEndpoint,
    "endpoints.1.endpointId": "addItem", "endpoints.1.method": "POST", "endpoints.1.targetUrl": "https://api.shop.com/items",
};

describe("PUT /api/gateway-provider", () => {
    test("full-replace: grow then shrink the endpoint set", async () => {
        const { cms, gateway } = makeCms();
        await postGatewayProvider(body("POST", oneEndpoint), cms);

        await putGatewayProvider(body("PUT", twoEndpoints), cms);
        expect((await gateway.getSource("urn:shop"))?.endpoints).toHaveLength(2);

        await putGatewayProvider(body("PUT", oneEndpoint), cms);
        expect((await gateway.getSource("urn:shop"))?.endpoints).toHaveLength(1);   // proves full-replace, not merge
    });

    test("unknown urn → InvalidParam", async () => {
        const { cms } = makeCms();
        await expect(putGatewayProvider(body("PUT", { ...oneEndpoint, id: "nope" }), cms))
            .rejects.toThrow(/Invalid param urn/);
    });
});
