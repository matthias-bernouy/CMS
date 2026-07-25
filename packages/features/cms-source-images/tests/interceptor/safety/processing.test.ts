import { describe, expect, mock, test } from "bun:test";
import {
    createSourceImageInterceptor,
    InMemorySourceImageCache,
    SOURCE_RESPONSIVE_WEBP_V1,
} from "@bernouy/cms-source-images";
import { SharpSourceImageTransformer } from "@bernouy/cms-source-images/sharp";
import {
    FakeImageTransformer,
    imageEndpoint,
    interceptorHarness,
    invoke,
    sourceRequest,
    upstreamImage,
} from "../../helpers/interceptorHarness";
import { solidImage } from "../../helpers/sharpFixtures";

describe("Source image processing safety", () => {
    test("rejects a corrupt decoder result without poisoning cache", async () => {
        const transformer = new FakeImageTransformer();
        transformer.failInspect = true;
        const harness = interceptorHarness({ transformer });
        const first = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        const second = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        expect(first.status).toBe(502);
        expect(second.status).toBe(502);
        expect(transformer.inspectCalls).toBe(2);
        expect(transformer.transformCalls).toBe(0);
        expect(harness.cache.derivativeCount).toBe(0);
        expect(harness.observations[0]?.reason).toBe("invalid_image");
    });

    test("rejects animated input explicitly", async () => {
        const transformer = new FakeImageTransformer();
        transformer.pages = 2;
        const harness = interceptorHarness({ transformer });
        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        expect(response.status).toBe(502);
        expect(transformer.transformCalls).toBe(0);
        expect(harness.observations[0]).toMatchObject({ outcome: "rejected", reason: "animated_image" });
    });

    test("rejects decoded dimensions over 40 MP", async () => {
        const transformer = new FakeImageTransformer();
        transformer.width = 10_000;
        transformer.height = 4_001;
        const harness = interceptorHarness({ transformer });
        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        expect(response.status).toBe(502);
        expect(transformer.transformCalls).toBe(0);
        expect(harness.observations[0]?.reason).toBe("pixel_limit");
    });

    test("never upscales a source narrower than the requested rung", async () => {
        const transformer = new FakeImageTransformer();
        transformer.width = 300;
        transformer.height = 180;
        const harness = interceptorHarness({ transformer });
        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(384), harness.next);
        expect(response.status).toBe(200);
        expect(new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()))).toEndWith("300");
        expect(transformer.transformCalls).toBe(1);
    });

    test("fails closed without caching if the transformer returns a false descriptor", async () => {
        const transformer = new FakeImageTransformer();
        transformer.transform = async () => ({
            bytes: new TextEncoder().encode("not-webp"),
            width: 383,
            height: 200,
        });
        const harness = interceptorHarness({ transformer });
        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(384), harness.next);
        expect(response.status).toBe(502);
        expect(response.headers.get("content-type")).not.toStartWith("image/");
        expect(harness.cache.derivativeCount).toBe(0);
        expect(harness.observations[0]?.outcome).toBe("failed");
    });

    test("never serves a truncated original when metadata succeeds but full decode fails", async () => {
        const complete = await solidImage("png", 320, 200);
        const truncated = complete.subarray(0, 100);
        const transformer = new SharpSourceImageTransformer();
        const cache = new InMemorySourceImageCache();
        const interceptor = createSourceImageInterceptor({
            cache,
            transformer,
            scope: "truncated-source",
        });
        const next = mock(async () => upstreamImage({ bytes: truncated }));
        await expect(transformer.inspect(truncated, SOURCE_RESPONSIVE_WEBP_V1)).resolves.toMatchObject({
            width: 320,
            height: 200,
        });

        const response = await invoke(interceptor, imageEndpoint(), sourceRequest(384), next);

        expect(response.status).toBe(502);
        expect(response.headers.get("content-type")).not.toStartWith("image/");
        expect(cache.derivativeCount).toBe(0);
    });

    test("bounds a stalled body read and cancels it", async () => {
        let cancelled = false;
        const harness = interceptorHarness({ readTimeoutMs: 5 });
        const next = mock(
            async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    { headers: { "content-type": "image/png" } },
                ),
        );
        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(response.status).toBe(502);
        expect(cancelled).toBe(true);
        expect(harness.observations[0]?.reason).toBe("read_timeout");
    });
});
