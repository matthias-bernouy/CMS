import { expect, test } from "bun:test";
import { ResponseCache } from "../../src/runtime/resources/cache/ResponseCache";
import { mountPublicPages } from "../../../../features/cms-content/tests/pages/delivery/routing/publicPage.fixture";
import { PRODUCT_PAGE } from "../../../../features/cms-content/tests/pages/delivery/routing/indexing/fixtures";

test("SSR query results never enter either cache and a live restriction cannot expose an older result", async () => {
    let allowed = true;
    let calls = 0;
    const content = mountPublicPages({
        storedPages: [PRODUCT_PAGE],
        gateway: {
            invoke: async () => {
                calls++;
                return allowed
                    ? {
                          kind: "success",
                          requestId: "query",
                          status: 200,
                          output: { slug: "chair", title: `Private query value ${calls}`, description: "Dynamic" },
                      }
                    : ({ kind: "failure", requestId: "query", status: 403, code: "not_authorized" } as never);
            },
        },
    });
    const edge = new ResponseCache();
    const path = "https://example.test/products/detail?site-product=chair";
    const load = async (request: Request) => {
        const response = await content.get(request);
        return { response, cacheControl: response.headers.get("cache-control") };
    };
    for (let index = 1; index <= 2; index++) {
        const response = await edge.handle(new Request(path), load);
        const text = await response.text();
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(text).toContain(`Private query value ${index}`);
        expect(edge.snapshot().entries).toBe(0);
    }
    allowed = false;
    const restricted = await edge.handle(new Request(path), load);
    expect(await restricted.text()).not.toContain("Private query value");
    expect(restricted.status).toBeGreaterThanOrEqual(400);
    expect(edge.snapshot().entries).toBe(0);
    expect(calls).toBe(3);
});
