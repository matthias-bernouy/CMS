import { describe, test, expect } from "bun:test";
import postGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.post";
import getGatewayProviders from "cms-control/api/gateway-provider/list.get";
import { InMemoryGatewayRepository } from "@bernouy/cms-gateway";

const makeCms = () => {
    const gateway = new InMemoryGatewayRepository();
    return { cms: { gateway } as any, gateway };
};

const list = () => new Request("http://localhost/cms/api/gateway-provider/list", { method: "GET" });

describe("GET /api/gateway-provider/list", () => {
    test("empty store → []", async () => {
        const { cms } = makeCms();
        const rows = await (await getGatewayProviders(list(), cms)).json();
        expect(rows).toEqual([]);
    });

    test("returns {urn,id,name,endpointCount}; name defaults to id when meta.name absent", async () => {
        const { cms } = makeCms();
        // No meta.name → parser defaults it to the id ("shop"); two endpoints.
        await postGatewayProvider(new Request("http://localhost/cms/api/gateway-provider", {
            method: "POST",
            body: JSON.stringify({
                id: "shop",
                "endpoints.0.endpointId": "getCart", "endpoints.0.method": "GET",  "endpoints.0.targetUrl": "https://api.shop.com/cart",
                "endpoints.1.endpointId": "addItem", "endpoints.1.method": "POST", "endpoints.1.targetUrl": "https://api.shop.com/items",
            }),
            headers: { "content-type": "application/json" },
        }), cms);

        const rows = await (await getGatewayProviders(list(), cms)).json();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({ urn: "urn:shop", id: "shop", name: "shop", endpointCount: 2 });
    });
});
