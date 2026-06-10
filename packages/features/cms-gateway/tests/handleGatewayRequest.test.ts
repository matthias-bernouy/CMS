import { describe, test, expect, mock } from "bun:test";
import { handleGatewayRequest } from "cms-gateway/http/handleGatewayRequest";
import { InMemoryGatewayRepository } from "cms-gateway/default-implementation/InMemoryGatewayRepository";
import type { Provider } from "cms-gateway/interfaces/Gateway";

const PREFIX = "/base/.cms/gateway/";

const provider: Provider = {
    urn: "urn:shop",
    endpoints: [
        { urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" },
    ],
};

async function seededRepo() {
    const r = new InMemoryGatewayRepository();
    await r.createProvider(provider);
    return r;
}

const okFetch = () => mock(async (_i: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response("ok"));

describe("handleGatewayRequest", () => {
    test("null gateway → 501", async () => {
        const res = await handleGatewayRequest(null, new Request("http://local" + PREFIX + "shop/getCart"), { prefix: PREFIX });
        expect(res.status).toBe(501);
        expect(await res.text()).toBe("data gateway not configured");
    });

    test("path not under prefix → 404", async () => {
        const res = await handleGatewayRequest(await seededRepo(), new Request("http://local/elsewhere/shop/getCart"), { prefix: PREFIX });
        expect(res.status).toBe(404);
        expect(await res.text()).toBe("Not Found");
    });

    test("unknown provider/endpoint → 404", async () => {
        const res = await handleGatewayRequest(await seededRepo(), new Request("http://local" + PREFIX + "shop/nope"), { prefix: PREFIX });
        expect(res.status).toBe(404);
        expect(await res.text()).toBe("not_found");
    });

    test("method mismatch → 405", async () => {
        const res = await handleGatewayRequest(await seededRepo(), new Request("http://local" + PREFIX + "shop/getCart", { method: "POST" }), { prefix: PREFIX });
        expect(res.status).toBe(405);
        expect(await res.text()).toBe("method_not_allowed");
    });

    test("a valid request is proxied upstream via deps.fetchImpl", async () => {
        const fetchImpl = okFetch();
        const res = await handleGatewayRequest(await seededRepo(), new Request("http://local" + PREFIX + "shop/getCart"), { prefix: PREFIX, deps: { fetchImpl } });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.shop.com/cart");
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("ok");
    });
});
