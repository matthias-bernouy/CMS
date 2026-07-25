import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SOURCE_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-source-images";
import { SharpSourceImageTransformer } from "@bernouy/cms-source-images/sharp";
import type { CorpusRejections } from "../contracts";
import { syntheticPng } from "./png";

const MEDIA_TYPES = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
} as const;

export type LoadedAsset = {
    assetId: string;
    bytes: Uint8Array;
    mediaType: string;
    width: number;
    height: number;
};

export type LoadedCorpus = {
    assets: LoadedAsset[];
    rejected: number;
    rejections: CorpusRejections;
    fingerprint: string;
};

export async function loadCorpus(options: { directory?: string; syntheticCount?: number }): Promise<LoadedCorpus> {
    const candidates = options.syntheticCount
        ? Array.from({ length: options.syntheticCount }, (_, index) => syntheticPng(1_600, 1_200, index + 1))
        : await readCorpusFiles(options.directory!);
    const accepted: Array<Omit<LoadedAsset, "assetId"> & { digest: string }> = [];
    const rejections: CorpusRejections = { animated: 0, invalidOrUnsafe: 0, oversizedBytes: 0 };
    const transformer = new SharpSourceImageTransformer();
    for (const bytes of candidates) {
        const inspected = await inspect(bytes, transformer);
        if ("rejection" in inspected) {
            rejections[inspected.rejection]++;
            continue;
        }
        accepted.push({ ...inspected.asset, digest: hash(bytes) });
    }
    accepted.sort((left, right) => left.digest.localeCompare(right.digest));
    if (accepted.length === 0) {
        throw new Error("The image corpus contains no supported raster image");
    }
    const assets = accepted.map(({ digest: _digest, ...asset }, index) => ({
        ...asset,
        assetId: `asset-${String(index + 1).padStart(4, "0")}`,
    }));
    return {
        assets,
        rejected: Object.values(rejections).reduce((sum, value) => sum + value, 0),
        rejections,
        fingerprint: hash(new TextEncoder().encode(accepted.map(({ digest }) => digest).join("\n"))),
    };
}

async function readCorpusFiles(directory: string): Promise<Uint8Array[]> {
    const files: string[] = [];
    await walk(directory, files);
    return Promise.all(files.map((path) => readFile(path)));
}

async function walk(directory: string, files: string[]): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            await walk(path, files);
        } else if (entry.isFile()) {
            files.push(path);
        }
    }
}

async function inspect(
    bytes: Uint8Array,
    transformer: SharpSourceImageTransformer,
): Promise<{ asset: Omit<LoadedAsset, "assetId"> } | { rejection: keyof CorpusRejections }> {
    if (bytes.byteLength > SOURCE_RESPONSIVE_WEBP_V1.maxSourceBytes) {
        return { rejection: "oversizedBytes" };
    }
    try {
        const metadata = await transformer.inspect(bytes, SOURCE_RESPONSIVE_WEBP_V1);
        if (metadata.pages !== 1) {
            return { rejection: "animated" };
        }
        const mediaType = MEDIA_TYPES[metadata.format];
        const width = metadata.width;
        const height = metadata.height;
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
            return { rejection: "invalidOrUnsafe" };
        }
        return { asset: { bytes, mediaType, width, height } };
    } catch {
        return { rejection: "invalidOrUnsafe" };
    }
}

function hash(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}
