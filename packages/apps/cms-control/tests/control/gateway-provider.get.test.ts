import { describe, test, expect } from "bun:test";
import postGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.post";
import getGatewayProvider from "cms-control/api/gateway-provider/gateway-provider.get";
import { InMemoryGatewayRepository } from "@bernouy/cms-gateway";

const makeCms = () => {
    const gateway = new InMemoryGatewayRepository();
    return { cms: { gateway } as any, gateway };
};

const seed = (cms: any) => postGatewayProvider(
    new Request("http://localhost/cms/api/gateway-provider", {
        method: "POST",
        body: JSON.stringify({
            id: "shop", "meta.name": "Shop",
            "endpoints.0.endpointId": "getCart", "endpoints.0.method": "GET",  "endpoints.0.targetUrl": "https://api.shop.com/cart",
            "endpoints.1.endpointId": "addItem", "endpoints.1.method": "POST", "endpoints.1.targetUrl": "https://api.shop.com/items",
        }),
        headers: { "content-type": "application/json" },
    }),
    cms,
);

const get = (qs: string) =>
    new Request("http://localhost/cms/api/gateway-provider" + qs, { method: "GET" });

describe("GET /api/gateway-provider?urn=", () => {
    test("returns the full provider + derived id + per-endpoint endpointId + endpointsJson", async () => {
        const { cms } = makeCms();
        await seed(cms);

        const res = await getGatewayProvider(get("?urn=urn:shop"), cms);
        const body = await res.json();

        expect(body.urn).toBe("urn:shop");
        expect(body.id).toBe("shop");                                  // derived (urn: prefix stripped)
        expect(body.endpoints).toHaveLength(2);
        expect(body.endpoints[0].endpointId).toBe("getCart");          // derived per-endpoint
        expect(body.endpoints[1].endpointId).toBe("addItem");
        expect(JSON.parse(body.endpointsJson)).toEqual(body.endpoints); // the C2 prefill string
    });

    test("unknown urn → InvalidParam", async () => {
        const { cms } = makeCms();
        await expect(getGatewayProvider(get("?urn=urn:nope"), cms)).rejects.toThrow(/Invalid param urn/);
    });

    test("missing urn → MissingParam", async () => {
        const { cms } = makeCms();
        await expect(getGatewayProvider(get(""), cms)).rejects.toThrow(/Missing param urn/);
    });
});
