import { imageSize } from "image-size";
import { SOURCE_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-source-images";
import sharp from "sharp";
import type { CorpusAssetSample } from "../contracts";
import type { ImagePerformanceAdapter } from "../core/adapter";
import type { LoadedCorpus } from "../core/corpus";
import { rounded } from "../core/math";

const FIDELITY_THUMBNAIL_SIZE = 64;

export async function benchmarkCorpus(
    corpus: LoadedCorpus,
    adapter: ImagePerformanceAdapter,
    ladder: readonly number[],
): Promise<CorpusAssetSample[]> {
    const samples: CorpusAssetSample[] = [];
    for (const asset of corpus.assets) {
        const passthrough = await measureResponse(
            asset.bytes,
            adapter.respond(asset, new Request(`https://benchmark.invalid/image/${asset.assetId}`)),
        );
        const variants = [];
        for (const targetWidth of ladder.filter((width) => width <= asset.width)) {
            variants.push({
                targetWidth,
                ...(await measureResponse(asset.bytes, adapter.variant(asset, targetWidth))),
            });
        }
        samples.push({
            assetId: asset.assetId,
            mediaType: asset.mediaType,
            sourceBytes: asset.bytes.byteLength,
            sourceWidth: asset.width,
            sourceHeight: asset.height,
            passthrough,
            variants,
        });
    }
    return samples;
}

async function measureResponse(source: Uint8Array, pendingResponse: Promise<Response>) {
    const startedAt = performance.now();
    try {
        const response = await pendingResponse;
        const bytes = new Uint8Array(await response.arrayBuffer());
        const dimensions = imageSize(bytes);
        const durationMs = rounded(performance.now() - startedAt);
        return {
            status: response.status,
            actualWidth: dimensions.width ?? null,
            actualHeight: dimensions.height ?? null,
            outputBytes: bytes.byteLength,
            matchesSourceBytes: bytesEqual(bytes, source),
            outputMediaType: response.headers.get("content-type"),
            outputFormat: dimensions.type ?? null,
            normalizedThumbnailMae: await normalizedThumbnailMae(source, bytes),
            durationMs,
            ...(!response.ok ? { error: `status_${response.status}` } : {}),
        };
    } catch (error) {
        return {
            status: null,
            actualWidth: null,
            actualHeight: null,
            outputBytes: null,
            matchesSourceBytes: null,
            outputMediaType: null,
            outputFormat: null,
            normalizedThumbnailMae: null,
            durationMs: rounded(performance.now() - startedAt),
            error: error instanceof Error ? error.name : "unknown",
        };
    }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

async function normalizedThumbnailMae(source: Uint8Array, output: Uint8Array): Promise<number> {
    const [reference, candidate] = await Promise.all([fidelityThumbnail(source), fidelityThumbnail(output)]);
    if (reference.byteLength !== candidate.byteLength || reference.byteLength === 0) {
        throw new Error("image fidelity thumbnails differ in shape");
    }
    let absoluteDifference = 0;
    for (let index = 0; index < reference.byteLength; index++) {
        absoluteDifference += Math.abs(reference[index]! - candidate[index]!);
    }
    return rounded(absoluteDifference / (reference.byteLength * 255), 6);
}

async function fidelityThumbnail(bytes: Uint8Array): Promise<Uint8Array> {
    const thumbnail = await sharp(bytes, {
        animated: false,
        failOn: "warning",
        limitInputPixels: SOURCE_RESPONSIVE_WEBP_V1.maxInputPixels,
    })
        .rotate()
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .toColourspace("srgb")
        .resize({
            width: FIDELITY_THUMBNAIL_SIZE,
            height: FIDELITY_THUMBNAIL_SIZE,
            fit: "fill",
        })
        .removeAlpha()
        .raw()
        .toBuffer();
    return new Uint8Array(thumbnail);
}
