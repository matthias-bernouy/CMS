import { describe, expect, mock, test } from "bun:test";
import {
    FakeImageTransformer,
    interceptorHarness,
    invoke,
    sourceRequest,
    upstreamImage,
} from "../../helpers/interceptorHarness";

describe("Source image public single-flight lifetime", () => {
    test("coalesces corrupt results for one wave and permits a later retry", async () => {
        const transformer = new FakeImageTransformer();
        transformer.failInspect = true;
        const harness = interceptorHarness({ transformer });
        const next = mock(async () => {
            await Bun.sleep(10);
            return upstreamImage();
        });

        const failed = await Promise.all(
            Array.from({ length: 8 }, () => invoke(harness.interceptor, harness.endpoint, sourceRequest(), next)),
        );
        expect(failed.every((response) => response.status === 502)).toBe(true);
        expect(await Promise.all(failed.map((response) => response.text()))).toHaveLength(8);
        expect(next).toHaveBeenCalledTimes(1);
        expect(transformer.inspectCalls).toBe(1);
        expect(harness.observations).toHaveLength(8);

        transformer.failInspect = false;
        const retried = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(retried.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(2);
        expect(transformer.inspectCalls).toBe(2);
        expect(transformer.transformCalls).toBe(1);
    });

    test("coalesces a non-cacheable wave without retaining its flight", async () => {
        const transformer = new FakeImageTransformer();
        const harness = interceptorHarness({ transformer });
        const next = mock(async () => {
            await Bun.sleep(10);
            return upstreamImage({ cacheControl: "public, max-age=0" });
        });

        const wave = await Promise.all(
            Array.from({ length: 8 }, () => invoke(harness.interceptor, harness.endpoint, sourceRequest(), next)),
        );
        expect(wave.every((response) => response.status === 200)).toBe(true);
        expect(await Promise.all(wave.map((response) => response.arrayBuffer()))).toHaveLength(8);
        expect(next).toHaveBeenCalledTimes(1);
        expect(transformer.inspectCalls).toBe(1);
        expect(transformer.transformCalls).toBe(1);
        expect(harness.observations).toHaveLength(8);

        const retried = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(retried.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(2);
        expect(transformer.inspectCalls).toBe(2);
        expect(transformer.transformCalls).toBe(1);
    });
});
