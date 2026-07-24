import { imageSize } from "image-size";
import type { CorpusAssetSample } from "../contracts";
import type { ImagePerformanceAdapter } from "../core/adapter";
import type { LoadedCorpus } from "../core/corpus";
import { rounded } from "../core/math";

export async function benchmarkCorpus(
    corpus: LoadedCorpus,
    adapter: ImagePerformanceAdapter,
    ladder: readonly number[],
): Promise<CorpusAssetSample[]> {
    const samples: CorpusAssetSample[] = [];
    for (const asset of corpus.assets) {
        const variants = [];
        for (const targetWidth of ladder.filter((width) => width <= asset.width)) {
            const startedAt = performance.now();
            try {
                const response = await adapter.variant(asset, targetWidth);
                const bytes = new Uint8Array(await response.arrayBuffer());
                const dimensions = imageSize(bytes);
                variants.push({
                    targetWidth,
                    actualWidth: dimensions.width ?? null,
                    actualHeight: dimensions.height ?? null,
                    outputBytes: bytes.byteLength,
                    durationMs: rounded(performance.now() - startedAt),
                    ...(!response.ok ? { error: `status_${response.status}` } : {}),
                });
            } catch (error) {
                variants.push({
                    targetWidth,
                    actualWidth: null,
                    actualHeight: null,
                    outputBytes: null,
                    durationMs: rounded(performance.now() - startedAt),
                    error: error instanceof Error ? error.name : "unknown",
                });
            }
        }
        samples.push({
            assetId: asset.assetId,
            mediaType: asset.mediaType,
            sourceBytes: asset.bytes.byteLength,
            sourceWidth: asset.width,
            sourceHeight: asset.height,
            variants,
        });
    }
    return samples;
}
