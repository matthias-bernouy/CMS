import { describe, test, expect } from "bun:test";
import postGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.post";
import getGatewayProviders from "cms-control/api/gateway-provider/list.get";
import {
    CompositeGatewayRepository,
    InMemoryGatewayRepository,
    SYSTEM_AUTH_PROVIDER_URN,
    SYSTEM_GATEWAY_PROVIDERS,
} from "@bernouy/cms-gateway";

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
        expect(rows[0]).toEqual({ urn: "urn:shop", id: "shop", name: "shop", endpointCount: 2, readonly: false });
    });

    test("marks system providers as readonly", async () => {
        const gateway = new CompositeGatewayRepository(new InMemoryGatewayRepository(), SYSTEM_GATEWAY_PROVIDERS);
        const cms = { gateway } as any;

        const rows = await (await getGatewayProviders(list(), cms)).json();
        expect(rows[0]).toEqual({
            urn:           SYSTEM_AUTH_PROVIDER_URN,
            id:            "system-auth",
            name:          "Authentication",
            endpointCount: 8,
            readonly:      true,
        });
    });
});
