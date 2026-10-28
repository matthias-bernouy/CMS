import { expect, test } from "bun:test";
import { InMemoryCache } from "@bernouy/http-runner";
import { resolveSvgSources } from "../../../src/runtime/content/inlineSvg";
import { gatewayRoute } from "../../../../../features/cms-gateway/tests/fixtures";
const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0"></path></svg>';
test("immutable SVG resolution uses the Provider client and caches a public query once", async () => {
    const route = await gatewayRoute({ binary: true });
    let calls = 0;
    const host = {
        cache: new InMemoryCache(),
        assets: { siteId: "default", store: {} } as never,
        release: async () => route.requestedRelease.admission.release,
        client: {
            invoke: async () => {
                calls += 1;
                return {
                    contentType: "image/svg+xml",
                    stream: new Response(SVG).body!,
                    responseHeaders: { etag: '"v1"', "cache-control": "public, immutable" },
                };
            },
        },
    };
    const source = "/.cms/call/catalog/v1/files/check";
    const [a, b] = await Promise.all([resolveSvgSources(host, [source]), resolveSvgSources(host, [source])]);
    expect(new TextDecoder().decode(a.get(source))).toBe(SVG);
    expect(b.get(source)).toEqual(a.get(source));
    expect(calls).toBe(1);
});
test.each([
    ['W/"v1"', "public, immutable", "strong ETag"],
    ['"v1"', "public", "immutable"],
])("rejects an SVG outside its immutable contract", async (etag, cache, issue) => {
    const route = await gatewayRoute({ binary: true });
    const host = {
        cache: new InMemoryCache(),
        assets: { siteId: "default", store: {} } as never,
        release: async () => route.requestedRelease.admission.release,
        client: {
            invoke: async () => ({
                contentType: "image/svg+xml",
                stream: new Response(SVG).body!,
                responseHeaders: { etag, "cache-control": cache },
            }),
        },
    };
    await expect(resolveSvgSources(host, ["/.cms/call/catalog/v1/files/check"])).rejects.toThrow(issue);
});
