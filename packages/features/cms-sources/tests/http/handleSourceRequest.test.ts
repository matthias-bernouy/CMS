import { describe, expect, test } from "bun:test";
import { handleSourceRequest } from "cms-sources/http/handleSourceRequest";
import { okFetch, seededSourceRepository, SOURCE_PREFIX } from "./handleSourceFixtures";

describe("handleSourceRequest routing", () => {
    test("returns 501 without a source repository", async () => {
        const response = await handleSourceRequest(null, new Request("http://local" + SOURCE_PREFIX + "shop/getCart"), {
            prefix: SOURCE_PREFIX,
        });
        expect(response.status).toBe(501);
        expect(await response.text()).toBe("data source not configured");
    });

    test("returns 404 for a path outside the source prefix", async () => {
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request("http://local/elsewhere/shop/getCart"),
            { prefix: SOURCE_PREFIX },
        );
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("Not Found");
    });

    test("returns 404 for an unknown endpoint", async () => {
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request("http://local" + SOURCE_PREFIX + "shop/nope"),
            { prefix: SOURCE_PREFIX },
        );
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("not_found");
    });

    test("returns 405 for a method mismatch", async () => {
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request("http://local" + SOURCE_PREFIX + "shop/getCart", { method: "POST" }),
            { prefix: SOURCE_PREFIX },
        );
        expect(response.status).toBe(405);
        expect(await response.text()).toBe("method_not_allowed");
    });

    test("proxies a valid request through the injected fetch", async () => {
        const fetchImpl = okFetch();
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request("http://local" + SOURCE_PREFIX + "shop/getCart"),
            { prefix: SOURCE_PREFIX, deps: { fetchImpl } },
        );
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.shop.com/cart");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
    });
});
