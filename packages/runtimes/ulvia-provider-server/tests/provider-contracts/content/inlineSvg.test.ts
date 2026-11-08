import { expect, test } from "bun:test";
import { InMemoryCache } from "@bernouy/http-runner";
import { resolveSvgSources } from "../../../src/runtime/content/inlineSvg";
import { gatewayRoute } from "../../../../../../tests/integration/gateway/fixtures";
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
    const source = "/.cms/call/ulvia/catalog/v1/files/check";
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
    await expect(resolveSvgSources(host, ["/.cms/call/ulvia/catalog/v1/files/check"])).rejects.toThrow(issue);
});

test("rejected SVG headers cancel the upstream body before any buffering", async () => {
    const route = await gatewayRoute({ binary: true });
    let cancellations = 0;
    const host = {
        cache: new InMemoryCache(),
        assets: {} as never,
        release: async () => route.requestedRelease.admission.release,
        client: {
            invoke: async () => ({
                contentType: "image/svg+xml",
                stream: new ReadableStream<Uint8Array>({
                    cancel() {
                        cancellations++;
                    },
                }),
                responseHeaders: { etag: 'W/"invalid"', "cache-control": "public, immutable" },
            }),
        },
    };
    await expect(resolveSvgSources(host, ["/.cms/call/ulvia/catalog/v1/files/check"])).rejects.toThrow("strong ETag");
    expect(cancellations).toBe(1);
});

test("shared SVG loading refuses above eight distinct pending bodies, releases failures and retries", async () => {
    const route = await gatewayRoute({ binary: true });
    let calls = 0;
    const outputs: ReadableStreamDefaultController<Uint8Array>[] = [];
    const host = {
        cache: new InMemoryCache({ maxEntries: 64 }),
        assets: {} as never,
        release: async () => route.requestedRelease.admission.release,
        client: {
            invoke: async () => {
                calls++;
                return {
                    contentType: "image/svg+xml",
                    stream: new ReadableStream<Uint8Array>({
                        start(output) {
                            outputs.push(output);
                        },
                    }),
                    responseHeaders: { etag: '"valid"', "cache-control": "public, immutable" },
                };
            },
        },
    };
    const source = "/.cms/call/ulvia/catalog/v1/files/check";
    const requests = Array.from({ length: 8 }, (_, index) => resolveSvgSources(host, [source + "?item=" + index]));
    // The ninth invocation must be attempted while the first eight bodies are still pending.
    for (let attempt = 0; outputs.length !== 8 && attempt < 100; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(outputs).toHaveLength(8);
    await expect(resolveSvgSources(host, [source + "?item=9"])).rejects.toThrow("concurrency");
    expect(calls).toBe(8);
    for (const output of outputs) {
        output.enqueue(new TextEncoder().encode(SVG));
        output.close();
    }
    await Promise.all(requests);
    const retry = resolveSvgSources(host, [source + "?item=9"]);
    for (let attempt = 0; outputs.length !== 9 && attempt < 100; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    outputs[8]!.enqueue(new TextEncoder().encode(SVG));
    outputs[8]!.close();
    expect(new TextDecoder().decode((await retry).get(source + "?item=9"))).toBe(SVG);
    expect(calls).toBe(9);
});

test("public capability SVG cache entries follow selected execution revisions", async () => {
    const route = await gatewayRoute({ binary: true });
    const source = "/.cms/call/ulvia/catalog/v1/files/check";
    let calls = 0;
    const host = {
        executionRevision: 1,
        cache: new InMemoryCache({ maxEntries: 64 }),
        assets: {} as never,
        release: async () => route.requestedRelease.admission.release,
        client: {
            invoke: async () => ({
                contentType: "image/svg+xml",
                stream: new Response(`<svg viewBox="0 0 24 24"><path d="M${++calls} 0"/></svg>`).body!,
                responseHeaders: { etag: `"revision-${calls}"`, "cache-control": "public, immutable" },
            }),
        },
    };
    const first = (await resolveSvgSources(host, [source])).get(source)!;
    expect((await resolveSvgSources(host, [source])).get(source)).toEqual(first);
    host.executionRevision = 2;
    const next = (await resolveSvgSources(host, [source])).get(source)!;
    expect(next).not.toEqual(first);
    expect(calls).toBe(2);
});
