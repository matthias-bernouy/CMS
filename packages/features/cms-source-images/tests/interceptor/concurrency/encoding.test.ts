import { describe, expect, test } from "bun:test";
import { FakeImageTransformer, interceptorHarness, invoke, sourceRequest } from "../../helpers/interceptorHarness";

describe("Source image encode single-flight", () => {
    test("reauthorizes every private request but coalesces the encode", async () => {
        const transformer = new FakeImageTransformer();
        transformer.delayMs = 20;
        const harness = interceptorHarness({ transformer, access: "auth" });

        await Promise.all(
            Array.from({ length: 8 }, () =>
                invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next),
            ),
        );

        expect(harness.next).toHaveBeenCalledTimes(8);
        expect(transformer.inspectCalls).toBe(8);
        expect(transformer.transformCalls).toBe(1);
    });

    test("does not retain a failed encode flight", async () => {
        const transformer = new FakeImageTransformer();
        transformer.failTransform = true;
        const harness = interceptorHarness({ transformer });

        const failed = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        expect(failed.status).toBe(502);
        expect(failed.headers.get("content-type")).not.toStartWith("image/");
        expect(harness.cache.derivativeCount).toBe(0);

        transformer.failTransform = false;
        const retried = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        expect(retried.headers.get("content-type")).toBe("image/webp");
        expect(transformer.transformCalls).toBe(2);
        expect(harness.cache.derivativeCount).toBe(1);
    });

    test("allows an independent key after another transform fails", async () => {
        const transformer = new FakeImageTransformer();
        const original = transformer.transform.bind(transformer);
        let first = true;
        transformer.transform = async (...args) => {
            if (first) {
                first = false;
                throw new Error("transient");
            }
            return original(...args);
        };
        const harness = interceptorHarness({ transformer, access: "auth" });

        const failed = await invoke(harness.interceptor, harness.endpoint, sourceRequest(128), harness.next);
        const successful = await invoke(harness.interceptor, harness.endpoint, sourceRequest(256), harness.next);

        expect(failed.status).toBe(502);
        expect(successful.headers.get("content-type")).toBe("image/webp");
    });
});
