import { describe, expect, mock, test } from "bun:test";
import { InMemorySourceImageCache } from "@bernouy/cms-source-images";
import { interceptorHarness, invoke, sourceRequest, upstreamImage } from "../../helpers/interceptorHarness";

describe("Source image public cache freshness", () => {
    test("serves a fresh warm hit without upstream or encode", async () => {
        const harness = interceptorHarness();
        const first = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        const second = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.headers.get("content-type")).toBe("image/webp");
        expect(second.headers.get("x-content-type-options")).toBe("nosniff");
        expect(harness.next).toHaveBeenCalledTimes(1);
        expect(harness.transformer.inspectCalls).toBe(1);
        expect(harness.transformer.transformCalls).toBe(1);
        expect(harness.observations[1]).toMatchObject({ outcome: "cache_hit", cache: "hit" });
    });

    test("returns 304 from a fresh derivative after CMS routing authorization", async () => {
        const harness = interceptorHarness();
        const generated = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        const etag = generated.headers.get("etag")!;
        const conditional = sourceRequest(384, { headers: { "If-None-Match": `W/${etag}` } });

        const response = await invoke(harness.interceptor, harness.endpoint, conditional, harness.next);

        expect(response.status).toBe(304);
        expect(await response.text()).toBe("");
        expect(response.headers.get("etag")).toBe(etag);
        expect(response.headers.has("content-length")).toBe(false);
        expect(harness.next).toHaveBeenCalledTimes(1);
    });

    test("bounds freshness by max-age and upstream Age without erasing stale telemetry", async () => {
        const now = { value: 1_000 };
        const harness = interceptorHarness({ now });
        const next = mock(async () => upstreamImage({ cacheControl: "public, max-age=60", headers: { Age: "10" } }));

        const first = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(first.headers.get("cache-control")).toBe("public, max-age=50, immutable, must-revalidate");
        now.value = 50_000;
        const warm = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(warm.headers.get("cache-control")).toBe("public, max-age=1, immutable, must-revalidate");
        expect(next).toHaveBeenCalledTimes(1);

        now.value = 51_000;
        await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(harness.observations[2]?.cache).toBe("stale");
    });

    test("subtracts apparent response age from Date without extending upstream freshness", async () => {
        const now = { value: Date.parse("2026-07-25T12:00:40.000Z") };
        const harness = interceptorHarness({ now });
        const next = mock(async () =>
            upstreamImage({
                cacheControl: "public, max-age=60",
                headers: { Date: "Sat, 25 Jul 2026 12:00:00 GMT" },
            }),
        );

        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(response.headers.get("cache-control")).toBe("public, max-age=20, immutable, must-revalidate");
    });

    test("never extends public freshness beyond one year", async () => {
        const now = { value: 1_000 };
        const cache = new InMemorySourceImageCache({
            now: () => now.value,
            maxDerivativeAgeMs: 31_536_000_000,
            maxLookupAgeMs: 31_536_000_000,
        });
        const harness = interceptorHarness({ now, cache });
        const next = mock(async () => upstreamImage({ cacheControl: "public, max-age=63072000, immutable" }));

        const generated = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(generated.headers.get("cache-control")).toBe("public, max-age=31536000, immutable, must-revalidate");

        now.value += 31_535_999_000;
        await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(next).toHaveBeenCalledTimes(1);

        now.value += 1_000;
        await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(next).toHaveBeenCalledTimes(2);
    });

    test.each([
        "private, max-age=3600",
        "public, no-store, max-age=3600",
        "public, no-cache, max-age=3600",
        "public",
        "public, s-maxage=3600",
        "public, max-age=0",
    ])("never bypasses upstream for cache policy %s", async (cacheControl) => {
        const harness = interceptorHarness();
        const next = mock(async () => upstreamImage({ cacheControl }));

        await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(next).toHaveBeenCalledTimes(2);
        expect(harness.transformer.transformCalls).toBe(1);
    });

    test("does not turn shared-only freshness into browser max-age", async () => {
        const harness = interceptorHarness();
        const next = mock(async () => upstreamImage({ cacheControl: "public, s-maxage=3600" }));

        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    test("parses quoted directive values without splitting their commas", async () => {
        const harness = interceptorHarness();
        const next = mock(async () =>
            upstreamImage({
                cacheControl: 'public, max-age="60", extension="value,with,commas"',
            }),
        );

        const first = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        const second = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(first.headers.get("cache-control")).toBe("public, max-age=60, immutable, must-revalidate");
        expect(second.headers.get("cache-control")).toBe("public, max-age=60, immutable, must-revalidate");
        expect(next).toHaveBeenCalledTimes(1);
    });
});
