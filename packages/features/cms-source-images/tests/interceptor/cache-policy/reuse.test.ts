import { describe, expect, mock, test } from "bun:test";
import { InMemorySourceImageCache } from "@bernouy/cms-source-images";
import { interceptorHarness, invoke, PNG_BYTES, sourceRequest, upstreamImage } from "../../helpers/interceptorHarness";

describe("Source image public cache reuse", () => {
    test("accepts only Vary headers covered by the logical request key", async () => {
        const covered = interceptorHarness();
        const coveredNext = mock(async () => upstreamImage({ headers: { Vary: "Accept-Language" } }));
        const french = sourceRequest(384, { headers: { "Accept-Language": "fr" } });
        const generated = await invoke(covered.interceptor, covered.endpoint, french, coveredNext);
        const warm = await invoke(covered.interceptor, covered.endpoint, french, coveredNext);

        expect(coveredNext).toHaveBeenCalledTimes(1);
        expect(generated.headers.get("vary")).toBe("Accept, Accept-Language");
        expect(warm.headers.get("vary")).toBe("Accept, Accept-Language");

        const uncovered = interceptorHarness();
        const uncoveredNext = mock(async () => upstreamImage({ headers: { Vary: "Origin" } }));
        await invoke(uncovered.interceptor, uncovered.endpoint, sourceRequest(), uncoveredNext);
        await invoke(uncovered.interceptor, uncovered.endpoint, sourceRequest(), uncoveredNext);
        expect(uncoveredNext).toHaveBeenCalledTimes(2);
    });

    test("does not share a Vary-covered response across request header values", async () => {
        const harness = interceptorHarness();
        const next = mock(async () => upstreamImage({ headers: { Vary: "Accept-Language" } }));

        await invoke(
            harness.interceptor,
            harness.endpoint,
            sourceRequest(384, { headers: { "Accept-Language": "fr" } }),
            next,
        );
        await invoke(
            harness.interceptor,
            harness.endpoint,
            sourceRequest(384, { headers: { "Accept-Language": "en" } }),
            next,
        );

        expect(next).toHaveBeenCalledTimes(2);
        expect(harness.cache.lookupCount).toBe(2);
    });

    test("never shares a public endpoint whose upstream identity is computed per caller", async () => {
        const harness = interceptorHarness();
        const endpoint = {
            ...harness.endpoint,
            input: {
                params: [
                    ...(harness.endpoint.input?.params ?? []),
                    {
                        name: "viewerId",
                        in: "header" as const,
                        source: { from: "computed" as const, ref: "userID" as const },
                        schema: { type: "string" as const },
                    },
                ],
            },
        };
        const next = mock(async () => upstreamImage());

        const first = await invoke(
            harness.interceptor,
            endpoint,
            sourceRequest(384, { headers: { Authorization: "Bearer user-a" } }),
            next,
        );
        const second = await invoke(
            harness.interceptor,
            endpoint,
            sourceRequest(384, { headers: { Authorization: "Bearer user-b" } }),
            next,
        );

        expect(next).toHaveBeenCalledTimes(2);
        expect(harness.cache.lookupCount).toBe(0);
        expect(first.headers.get("cache-control")).toBe("private, no-store");
        expect(second.headers.get("cache-control")).toBe("private, no-store");
    });

    test("source replacement after expiry creates a new derivative key", async () => {
        const now = { value: 0 };
        const harness = interceptorHarness({ now });
        let version = 1;
        const next = mock(async () =>
            upstreamImage({
                bytes: new Uint8Array([...PNG_BYTES, version]),
                cacheControl: "public, max-age=1",
            }),
        );

        await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        version = 2;
        now.value = 1_000;
        await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(next).toHaveBeenCalledTimes(2);
        expect(harness.transformer.transformCalls).toBe(2);
        expect(harness.cache.derivativeCount).toBe(2);
    });

    test.each(["future", "overlong", "nan", "infinite"] as const)(
        "fails closed for a %s lookup returned by an adapter",
        async (kind) => {
            const now = { value: 1_000 };
            const cache = new CorruptingLookupCache(kind, now);
            const harness = interceptorHarness({ now, cache });

            await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
            await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);

            expect(harness.next).toHaveBeenCalledTimes(2);
        },
    );

    test("never inherits stale Content-Length or Content-Encoding", async () => {
        const harness = interceptorHarness();
        const next = mock(async () =>
            upstreamImage({
                headers: {
                    "Content-Length": String(PNG_BYTES.byteLength),
                    "Content-Encoding": "gzip",
                },
            }),
        );

        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(response.headers.has("content-length")).toBe(false);
        expect(response.headers.has("content-encoding")).toBe(false);
        expect(response.headers.get("content-type")).toBe("image/webp");
    });
});

class CorruptingLookupCache extends InMemorySourceImageCache {
    constructor(
        private readonly corruption: "future" | "overlong" | "nan" | "infinite",
        private readonly clock: { value: number },
    ) {
        super({ now: () => clock.value });
    }

    override async getLookup(key: string) {
        const lookup = await super.getLookup(key);
        if (!lookup) {
            return null;
        }
        switch (this.corruption) {
            case "future":
                return { ...lookup, createdAt: this.clock.value + 1, freshUntil: this.clock.value + 10_000 };
            case "overlong":
                return { ...lookup, freshUntil: lookup.createdAt + 31_536_000_001 };
            case "nan":
                return { ...lookup, createdAt: Number.NaN };
            case "infinite":
                return { ...lookup, freshUntil: Number.POSITIVE_INFINITY };
        }
    }
}
