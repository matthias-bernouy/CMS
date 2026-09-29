import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { benchmarkListing } from "../benchmark/listingBenchmark";
import { createAdapter } from "../core/adapter";
import { syntheticPng } from "../core/png";

const ADAPTER = "module:quality/image-performance/benchmark/adapters/gatewayImagesAdapter.ts";

function asset(seed: number) {
    return {
        assetId: "asset-1",
        bytes: syntheticPng(800, 600, seed),
        mediaType: "image/png",
        width: 800,
        height: 600,
    };
}

describe("gateway image performance adapter", () => {
    test("measures the gateway derivative route and its warm local cache", async () => {
        const adapter = await createAdapter(ADAPTER, { imageUpstreamDelayMs: 0 });
        try {
            const original = await adapter.respond(asset(1), new Request("https://benchmark.invalid/image/asset-1"));
            expect(original.status).toBe(200);
            expect(original.headers.get("content-type")).toBe("image/png");
            expect(new Uint8Array(await original.arrayBuffer())).toEqual(asset(1).bytes);

            const cold = await adapter.variant(asset(1), 384);
            const warm = await adapter.variant(asset(1), 384);
            expect(cold.status).toBe(200);
            expect(warm.status).toBe(200);
            expect(cold.headers.get("content-type")).toBe("image/webp");
            expect((await sharp(await cold.arrayBuffer()).metadata()).width).toBe(384);
            expect(await warm.arrayBuffer()).toBeDefined();
            expect(adapter.stats()).toEqual({ upstreamReads: 3, encodes: 1, cacheHits: 1 });
        } finally {
            await adapter.dispose?.();
        }
    });

    test("changes the derivative generation when provider bytes change", async () => {
        const adapter = await createAdapter(ADAPTER, { imageUpstreamDelayMs: 0 });
        try {
            const first = await adapter.variant(asset(1), 384);
            const changed = await adapter.variant(asset(2), 384);
            expect(first.status).toBe(200);
            expect(changed.status).toBe(200);
            expect(first.headers.get("etag")).not.toBe(changed.headers.get("etag"));
            expect(adapter.stats()).toEqual({ upstreamReads: 2, encodes: 2, cacheHits: 0 });
        } finally {
            await adapter.dispose?.();
        }
    });

    test("measures gateway image requests alongside foreground traffic", async () => {
        const adapter = await createAdapter(ADAPTER, { imageUpstreamDelayMs: 0 });
        try {
            const sample = await benchmarkListing(
                {
                    assets: [asset(1)],
                    rejected: 0,
                    rejections: { animated: 0, invalidOrUnsafe: 0, oversizedBytes: 0 },
                    fingerprint: "test",
                },
                adapter,
                {
                    ladder: [384],
                    cardCount: 1,
                    viewportWidth: 200,
                    repetitions: 1,
                    users: [1],
                    foregroundRequests: 2,
                    imageUpstreamDelayMs: 0,
                },
            );
            expect(sample).toHaveLength(8);
            expect(sample.every((entry) => entry.failedImages === 0)).toBe(true);
            expect(sample.every((entry) => entry.foregroundSamples >= 2)).toBe(true);
        } finally {
            await adapter.dispose?.();
        }
    });
});
