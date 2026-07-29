import { describe, expect, mock, test } from "bun:test";
import { SourceImageSemaphore } from "@bernouy/cms-source-images";
import {
    FakeImageTransformer,
    interceptorHarness,
    invoke,
    sourceRequest,
    upstreamImage,
} from "../../helpers/interceptorHarness";

describe("Source image public saturation fallback", () => {
    test("serves an uncached original while a bounded background job warms the derivative", async () => {
        const transformer = new FakeImageTransformer();
        transformer.delayMs = 35;
        const harness = interceptorHarness({
            transformer,
            semaphore: new SourceImageSemaphore(1),
            jobSemaphoreWaitTimeoutMs: 1_000,
            jobFetch: async () =>
                upstreamImage({
                    headers: {
                        ETag: '"original"',
                    },
                }),
        });
        const next = mock(async () =>
            upstreamImage({
                headers: {
                    ETag: '"original"',
                },
            }),
        );
        const narrow = sourceRequest(128);
        const wide = sourceRequest(256);

        const responses = await Promise.all([
            invoke(harness.interceptor, harness.endpoint, narrow, next),
            invoke(harness.interceptor, harness.endpoint, wide, next),
        ]);
        const fallbackIndex = responses.findIndex((response) => response.headers.get("content-type") === "image/png");
        const fallback = responses[fallbackIndex]!;

        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        expect(fallback.headers.get("cache-control")).toBe("private, no-store");
        expect(fallback.headers.get("etag")).toBeNull();
        expect(fallback.headers.get("set-cookie")).toBeNull();
        expect(await fallback.bytes()).toEqual(
            new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
        );
        expect(harness.observations.some((item) => item.outcome === "fallback")).toBe(true);

        const warmedRequest = fallbackIndex === 0 ? narrow : wide;
        await waitFor(() => harness.observations.some((item) => item.outcome === "generated" && item.width === 2560));
        const warmed = await invoke(harness.interceptor, harness.endpoint, warmedRequest, next);

        expect(warmed.status).toBe(200);
        expect(warmed.headers.get("content-type")).toBe("image/webp");
        expect(warmed.headers.get("cache-control")).toStartWith("public, max-age=");
        expect(next).toHaveBeenCalledTimes(2);
        expect(transformer.maxActive).toBe(1);
    });
});

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) {
            return;
        }
        await Bun.sleep(10);
    }
    throw new Error("background source image warmup timed out");
}
