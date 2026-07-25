import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { benchmarkCorpus } from "../benchmark/corpusBenchmark";
import { createAdapter } from "../core/adapter";
import { loadCorpus } from "../core/corpus";
import { syntheticPng } from "../core/png";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("image performance corpus", () => {
    test("is deterministic and does not expose source paths", async () => {
        const directory = await temporaryDirectory();
        const secretName = "customer-offer-private-name.png";
        await writeFile(join(directory, secretName), syntheticPng(320, 240, 7));
        await writeFile(join(directory, "invalid.svg"), "<svg></svg>");

        const first = await loadCorpus({ directory });
        const second = await loadCorpus({ directory });
        const serialized = JSON.stringify(first);

        expect(first.fingerprint).toBe(second.fingerprint);
        expect(first.assets).toHaveLength(1);
        expect(first.rejected).toBe(1);
        expect(first.rejections).toEqual({ animated: 0, invalidOrUnsafe: 1, oversizedBytes: 0 });
        expect(first.assets[0]?.assetId).toBe("asset-0001");
        expect(serialized).not.toContain(secretName);
        expect(serialized).not.toContain(directory);
    });

    test("rejects a corpus with no supported raster image", async () => {
        const directory = await temporaryDirectory();
        await writeFile(join(directory, "invalid.txt"), "not an image");

        await expect(loadCorpus({ directory })).rejects.toThrow("no supported raster image");
    });

    test("uses the production auto-oriented dimensions and accepts AVIF", async () => {
        const directory = await temporaryDirectory();
        const orientedJpeg = await sharp({
            create: {
                width: 40,
                height: 20,
                channels: 3,
                background: { r: 10, g: 20, b: 30 },
            },
        })
            .jpeg()
            .withMetadata({ orientation: 6 })
            .toBuffer();
        const avif = await sharp({
            create: {
                width: 24,
                height: 16,
                channels: 3,
                background: { r: 30, g: 20, b: 10 },
            },
        })
            .avif()
            .toBuffer();
        await writeFile(join(directory, "oriented.jpg"), orientedJpeg);
        await writeFile(join(directory, "sample.avif"), avif);

        const corpus = await loadCorpus({ directory });
        const metadata = corpus.assets
            .map(({ mediaType, width, height }) => ({ mediaType, width, height }))
            .sort((left, right) => left.mediaType.localeCompare(right.mediaType));

        expect(metadata).toEqual([
            { mediaType: "image/avif", width: 24, height: 16 },
            { mediaType: "image/jpeg", width: 20, height: 40 },
        ]);
        expect(corpus.rejected).toBe(0);
    });

    test("always measures passthrough even below the first derivative rung", async () => {
        const corpus = await loadCorpus({ syntheticCount: 1 });
        const bytes = syntheticPng(32, 24, 11);
        corpus.assets = [
            {
                assetId: "asset-0001",
                bytes,
                mediaType: "image/png",
                width: 32,
                height: 24,
            },
        ];
        const adapter = await createAdapter("original");
        try {
            const samples = await benchmarkCorpus(corpus, adapter, [64]);

            expect(samples[0]?.variants).toEqual([]);
            expect(samples[0]?.passthrough).toMatchObject({
                status: 200,
                actualWidth: 32,
                actualHeight: 24,
                matchesSourceBytes: true,
                normalizedThumbnailMae: 0,
            });
        } finally {
            await adapter.dispose?.();
        }
    });

    test("records a bounded thumbnail fidelity signal for the production candidate", async () => {
        const corpus = await loadCorpus({ syntheticCount: 1 });
        const adapter = await createAdapter("module:quality/image-performance/core/sourceImagesAdapter.ts");
        try {
            const samples = await benchmarkCorpus(corpus, adapter, [384]);

            expect(samples[0]?.passthrough.normalizedThumbnailMae).toBe(0);
            expect(samples[0]?.variants[0]?.normalizedThumbnailMae).toBeGreaterThanOrEqual(0);
            expect(samples[0]?.variants[0]?.normalizedThumbnailMae).toBeLessThanOrEqual(0.15);
        } finally {
            await adapter.dispose?.();
        }
    });
});

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "cms-image-corpus-test-"));
    directories.push(directory);
    return directory;
}
