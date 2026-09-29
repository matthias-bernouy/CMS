import { describe, expect, test } from "bun:test";
import { runSustainedForeground } from "../benchmark/listingRequests";
import { assertReleaseAdapterSpecifier, createAdapter, RELEASE_CANDIDATE_ADAPTER } from "../core/adapter";
import type { LoadedAsset } from "../core/corpus";
import { syntheticPng } from "../core/png";

describe("image performance runtime", () => {
    test("allows only the real release adapters in benchmark artifacts", () => {
        expect(() => assertReleaseAdapterSpecifier("original")).not.toThrow();
        expect(() => assertReleaseAdapterSpecifier(RELEASE_CANDIDATE_ADAPTER)).not.toThrow();
        expect(() => assertReleaseAdapterSpecifier("module:/tmp/forged-adapter.ts")).toThrow(
            "Release image benchmarks require",
        );
    });

    test("drives original image and foreground traffic through the baseline", async () => {
        const adapter = await createAdapter("original");
        try {
            const asset = syntheticAsset();
            const image = await adapter.respond(
                asset,
                new Request(`https://benchmark.invalid/image/${asset.assetId}?cms-width=384`),
            );
            const foreground = await adapter.foreground(new Request("https://benchmark.invalid/foreground?sequence=1"));

            expect(image.status).toBe(200);
            expect(image.headers.get("content-type")).toBe("image/png");
            expect((await image.arrayBuffer()).byteLength).toBe(asset.bytes.byteLength);
            expect(adapter.stats().upstreamReads).toBe(1);
            expect(foreground.status).toBe(200);
            expect((await foreground.json()) as { items: unknown[] }).toEqual({
                items: expect.arrayContaining([
                    expect.objectContaining({
                        id: "offer-1",
                        media: expect.objectContaining({ width: 1_600, height: 1_200 }),
                    }),
                ]),
            });
        } finally {
            await adapter.dispose?.();
        }
    });

    test("uses the gateway LocalFS candidate cache across a warm request", async () => {
        const adapter = await createAdapter(RELEASE_CANDIDATE_ADAPTER);
        try {
            const asset = syntheticAsset();
            const cold = await adapter.variant(asset, 384);
            const warm = await adapter.variant(asset, 384);
            await Promise.all([cold.arrayBuffer(), warm.arrayBuffer()]);

            expect(cold.headers.get("content-type")).toBe("image/webp");
            expect(warm.headers.get("content-type")).toBe("image/webp");
            expect(adapter.stats()).toEqual({ cacheHits: 1, encodes: 1, upstreamReads: 2 });
        } finally {
            await adapter.dispose?.();
        }
    });

    test("reauthorizes every overlapping request but transforms only once", async () => {
        const adapter = await createAdapter(RELEASE_CANDIDATE_ADAPTER, {
            imageUpstreamDelayMs: 25,
        });
        try {
            const asset = syntheticAsset();
            const startedAt = performance.now();
            const responses = await Promise.all(Array.from({ length: 20 }, () => adapter.variant(asset, 384)));
            const bodies = await Promise.all(responses.map((response) => response.arrayBuffer()));

            expect(performance.now() - startedAt).toBeGreaterThanOrEqual(20);
            expect(new Set(responses.map(({ status }) => status))).toEqual(new Set([200]));
            expect(new Set(bodies.map(({ byteLength }) => byteLength)).size).toBe(1);
            expect(adapter.stats()).toMatchObject({ encodes: 1, upstreamReads: 20 });
        } finally {
            await adapter.dispose?.();
        }
    });

    test("serves the browser fixture through the gateway and Sharp adapter", () => {
        const result = Bun.spawnSync({
            cmd: [process.execPath, new URL("./browser-runtime.fixture.ts", import.meta.url).pathname],
            cwd: new URL("../../../", import.meta.url).pathname,
            stderr: "pipe",
        });

        expect(new TextDecoder().decode(result.stderr)).toBe("");
        expect(result.exitCode).toBe(0);
    });

    test("keeps foreground workers active until image work settles", async () => {
        let settleWork!: () => void;
        const work = new Promise<void>((resolve) => {
            settleWork = resolve;
        });
        const sequences: number[] = [];

        await runSustainedForeground({
            work,
            minimumRequests: 4,
            concurrency: 2,
            request: async (sequence) => {
                sequences.push(sequence);
                if (sequences.length === 8) {
                    settleWork();
                }
            },
            pace: async () => {},
        });

        expect(sequences.length).toBeGreaterThanOrEqual(8);
        expect(new Set(sequences).size).toBe(sequences.length);
    });
});

function syntheticAsset(): LoadedAsset {
    return {
        assetId: "asset-0001",
        bytes: syntheticPng(1_600, 1_200, 1),
        mediaType: "image/png",
        width: 1_600,
        height: 1_200,
    };
}
