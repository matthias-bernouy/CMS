import { describe, expect, mock, test } from "bun:test";
import { SourceImageSemaphore } from "@bernouy/cms-source-images";
import {
    FakeImageTransformer,
    interceptorHarness,
    invoke,
    sourceRequest,
    upstreamImage,
} from "../../helpers/interceptorHarness";

describe("Source image processing admission", () => {
    test("bounds different-key encodes with the global semaphore", async () => {
        const transformer = new FakeImageTransformer();
        transformer.inspectDelayMs = 10;
        transformer.delayMs = 25;
        const harness = interceptorHarness({
            transformer,
            access: "auth",
            semaphore: new SourceImageSemaphore(2),
            semaphoreWaitTimeoutMs: 1_000,
        });

        await Promise.all(
            [128, 256, 384, 512, 768].map((width) =>
                invoke(harness.interceptor, harness.endpoint, sourceRequest(width), harness.next),
            ),
        );

        expect(transformer.transformCalls).toBe(5);
        expect(transformer.maxActive).toBe(2);
    });

    test("bounds inspection and encoding under the same lease", async () => {
        const transformer = new FakeImageTransformer();
        transformer.inspectDelayMs = 20;
        transformer.delayMs = 10;
        const harness = interceptorHarness({
            transformer,
            access: "auth",
            semaphore: new SourceImageSemaphore(2),
            semaphoreWaitTimeoutMs: 1_000,
        });

        await Promise.all(
            [64, 128, 256, 384, 512, 768].map((width) => {
                const request = new URL(sourceRequest(width).url);
                request.searchParams.set("id", `offer-${width}`);
                return invoke(harness.interceptor, harness.endpoint, new Request(request), harness.next);
            }),
        );

        expect(transformer.inspectCalls).toBe(6);
        expect(transformer.transformCalls).toBe(6);
        expect(transformer.maxActive).toBeLessThanOrEqual(2);
    });

    test("keeps a retryable response for saturated private transforms", async () => {
        const transformer = new FakeImageTransformer();
        transformer.delayMs = 30;
        const harness = interceptorHarness({
            transformer,
            access: "auth",
            semaphore: new SourceImageSemaphore(1, 0),
            semaphoreWaitTimeoutMs: 1,
        });

        const [first, second] = await Promise.all([
            invoke(harness.interceptor, harness.endpoint, sourceRequest(128), harness.next),
            invoke(harness.interceptor, harness.endpoint, sourceRequest(256), harness.next),
        ]);

        expect([first.status, second.status].sort()).toEqual([200, 503]);
        const busy = first.status === 503 ? first : second;
        expect(busy.headers.get("content-type")).not.toStartWith("image/");
        expect(busy.headers.get("retry-after")).toBe("1");
        expect(transformer.maxActive).toBe(1);
        expect(harness.next).toHaveBeenCalledTimes(1);
        expect(harness.observations.some((item) => item.reason === "semaphore_saturated")).toBe(true);
    });

    test("acquires admission before opening queued upstream bodies", async () => {
        const transformer = new FakeImageTransformer();
        transformer.delayMs = 30;
        const semaphore = new SourceImageSemaphore(1);
        const harness = interceptorHarness({
            transformer,
            access: "auth",
            semaphore,
            semaphoreWaitTimeoutMs: 1_000,
        });
        let openBodies = 0;
        let maxOpenBodies = 0;
        const next = mock(async () => responseWithObservedBody());

        function responseWithObservedBody(): Response {
            openBodies++;
            maxOpenBodies = Math.max(maxOpenBodies, openBodies);
            let emitted = false;
            let closed = false;
            const closeBody = () => {
                if (!closed) {
                    closed = true;
                    openBodies--;
                }
            };
            return new Response(
                new ReadableStream<Uint8Array>({
                    pull(controller) {
                        if (emitted) {
                            controller.close();
                            closeBody();
                            return;
                        }
                        emitted = true;
                        controller.enqueue(new Uint8Array(awaitableBodyBytes()));
                    },
                    cancel() {
                        closeBody();
                    },
                }),
                {
                    headers: {
                        "content-type": "image/png",
                        "cache-control": "private, no-store",
                    },
                },
            );
        }

        const responses = await Promise.all(
            [128, 256, 384].map((width) => {
                const request = new URL(sourceRequest(width).url);
                request.searchParams.set("id", `offer-${width}`);
                return invoke(harness.interceptor, harness.endpoint, new Request(request), next);
            }),
        );

        expect(responses.every((response) => response.status === 200)).toBe(true);
        expect(next).toHaveBeenCalledTimes(3);
        expect(maxOpenBodies).toBe(1);
        expect(openBodies).toBe(0);
        expect(semaphore.activeCount).toBe(0);
    });
});

function awaitableBodyBytes(): ArrayBuffer {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).buffer;
}
