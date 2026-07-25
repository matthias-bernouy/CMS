import { describe, expect, test } from "bun:test";
import {
    createSourceImageInterceptor,
    InMemorySourceImageCache,
    SOURCE_RESPONSIVE_WEBP_V1,
} from "@bernouy/cms-source-images";
import {
    FakeImageTransformer,
    imageEndpoint,
    invoke,
    sourceRequest,
    upstreamImage,
} from "../helpers/interceptorHarness";

describe("Source image cache identity", () => {
    test("changes when the immutable recipe id changes", async () => {
        const cache = new InMemorySourceImageCache();
        const transformer = new FakeImageTransformer();
        const first = createSourceImageInterceptor({
            cache,
            transformer,
            scope: "site-a",
            recipe: SOURCE_RESPONSIVE_WEBP_V1,
        });
        const second = createSourceImageInterceptor({
            cache,
            transformer,
            scope: "site-a",
            recipe: { ...SOURCE_RESPONSIVE_WEBP_V1, id: "source-responsive-webp-v2" },
        });
        const endpoint = imageEndpoint();
        await invoke(first, endpoint, sourceRequest(), async () => upstreamImage());
        await invoke(second, endpoint, sourceRequest(), async () => upstreamImage());
        expect(transformer.transformCalls).toBe(2);
        expect(cache.derivativeCount).toBe(2);
        expect(cache.lookupCount).toBe(2);
    });

    test("partitions identical content by CMS scope", async () => {
        const cache = new InMemorySourceImageCache();
        const transformer = new FakeImageTransformer();
        const create = (scope: string) => createSourceImageInterceptor({ cache, transformer, scope });
        const endpoint = imageEndpoint();
        await invoke(create("site-a"), endpoint, sourceRequest(), async () => upstreamImage());
        await invoke(create("site-b"), endpoint, sourceRequest(), async () => upstreamImage());
        expect(transformer.transformCalls).toBe(2);
        expect(cache.derivativeCount).toBe(2);
    });

    test("includes resolved endpoint target and canonical declared query", async () => {
        const cache = new InMemorySourceImageCache();
        const transformer = new FakeImageTransformer();
        const interceptor = createSourceImageInterceptor({ cache, transformer, scope: "site-a" });
        await invoke(interceptor, imageEndpoint(), sourceRequest(), async () => upstreamImage());
        const otherTarget = imageEndpoint({ targetUrl: "https://other.test/image" });
        await invoke(interceptor, otherTarget, sourceRequest(), async () => upstreamImage());
        const otherQuery = new URL(sourceRequest().url);
        otherQuery.searchParams.set("id", "offer-2");
        await invoke(interceptor, imageEndpoint(), new Request(otherQuery), async () => upstreamImage());
        expect(transformer.transformCalls).toBe(3);
        expect(cache.derivativeCount).toBe(3);
    });

    test("changes when the resolved endpoint header contract changes", async () => {
        const cache = new InMemorySourceImageCache();
        const transformer = new FakeImageTransformer();
        const interceptor = createSourceImageInterceptor({ cache, transformer, scope: "site-a" });
        const first = imageEndpoint({
            headers: [{ name: "x-tenant", source: { from: "static", value: "tenant-a" } }],
        });
        const second = imageEndpoint({
            headers: [{ name: "x-tenant", source: { from: "static", value: "tenant-b" } }],
        });

        await invoke(interceptor, first, sourceRequest(), async () => upstreamImage());
        await invoke(interceptor, second, sourceRequest(), async () => upstreamImage());

        expect(transformer.transformCalls).toBe(2);
        expect(cache.lookupCount).toBe(2);
    });

    test("does not let undeclared noise fragment source identity", async () => {
        const cache = new InMemorySourceImageCache();
        const transformer = new FakeImageTransformer();
        const interceptor = createSourceImageInterceptor({ cache, transformer, scope: "site-a" });
        const endpoint = imageEndpoint({ access: { mode: "auth" } });
        const noisy = new URL(sourceRequest().url);
        noisy.searchParams.set("tracking", "noise");
        await invoke(interceptor, endpoint, sourceRequest(), async () => upstreamImage());
        await invoke(interceptor, endpoint, new Request(noisy), async () => upstreamImage());
        expect(transformer.transformCalls).toBe(1);
        expect(cache.derivativeCount).toBe(1);
    });

    test("partitions public lookups by forwarded Content-Type", async () => {
        const cache = new InMemorySourceImageCache();
        const transformer = new FakeImageTransformer();
        const interceptor = createSourceImageInterceptor({ cache, transformer, scope: "site-a" });
        const endpoint = imageEndpoint();
        let upstreamCalls = 0;
        const next = async () => {
            upstreamCalls += 1;
            return upstreamImage();
        };

        await invoke(interceptor, endpoint, sourceRequest(384, { headers: { "Content-Type": "application/a" } }), next);
        await invoke(interceptor, endpoint, sourceRequest(384, { headers: { "Content-Type": "application/b" } }), next);

        expect(upstreamCalls).toBe(2);
        expect(cache.lookupCount).toBe(2);
    });
});
