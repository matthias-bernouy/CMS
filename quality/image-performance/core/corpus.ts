import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { imageSize } from "image-size";
import { syntheticPng } from "./png";

const MEDIA_TYPES = new Map([
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
    ["gif", "image/gif"],
    ["avif", "image/avif"],
]);

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
    fingerprint: string;
};

export async function loadCorpus(options: {
    directory?: string;
    syntheticCount?: number;
}): Promise<LoadedCorpus> {
    const candidates = options.syntheticCount
        ? Array.from({ length: options.syntheticCount }, (_, index) => syntheticPng(1_600, 1_200, index + 1))
        : await readCorpusFiles(options.directory!);
    const accepted: Array<Omit<LoadedAsset, "assetId"> & { digest: string }> = [];
    let rejected = 0;
    for (const bytes of candidates) {
        const asset = inspect(bytes);
        if (!asset) {
            rejected++;
            continue;
        }
        accepted.push({ ...asset, digest: hash(bytes) });
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
        rejected,
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

function inspect(bytes: Uint8Array): Omit<LoadedAsset, "assetId"> | null {
    try {
        const dimensions = imageSize(bytes);
        const mediaType = MEDIA_TYPES.get(dimensions.type ?? "");
        const width = dimensions.width;
        const height = dimensions.height;
        if (
            !mediaType ||
            typeof width !== "number" ||
            typeof height !== "number" ||
            !Number.isSafeInteger(width) ||
            !Number.isSafeInteger(height) ||
            width <= 0 ||
            height <= 0 ||
            width * height > 40_000_000 ||
            bytes.byteLength > 10 * 1024 * 1024
        ) {
            return null;
        }
        return { bytes, mediaType, width, height };
    } catch {
        return null;
    }
}

function hash(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}
