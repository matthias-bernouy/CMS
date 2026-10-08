import type { BlobStore } from "@bernouy/blob-store";
import type { ImageTransformer } from "@bernouy/image-processing";
import type { CmsFilesStore, FileDerivativeScheduler, FileRecord, FileVariant } from "cms-files/interfaces";

const PROFILE_WIDTHS = {
    thumbnail: [64, 128, 256],
    responsive: [320, 640, 960, 1280, 1920],
} as const;

export interface CmsImageDerivativesOptions {
    readonly store: CmsFilesStore;
    readonly blobs: BlobStore;
    readonly transformer: ImageTransformer;
    readonly maxInputBytes?: number;
    readonly reportError?: (error: unknown) => void;
}

/** Reconstructible, content-addressed derivatives. Originals remain the source of truth. */
export class CmsImageDerivatives implements FileDerivativeScheduler {
    readonly #options: CmsImageDerivativesOptions;

    constructor(options: CmsImageDerivativesOptions) {
        this.#options = options;
    }

    enqueue(file: FileRecord): void {
        if (!file.imageProfile || !file.mimeType.startsWith("image/")) {
            return;
        }
        queueMicrotask(() => {
            void this.process(file).catch((error) => this.#options.reportError?.(error));
        });
    }

    async process(file: FileRecord): Promise<readonly FileVariant[]> {
        if (
            !file.imageProfile ||
            file.mimeType === "image/svg+xml" ||
            file.mimeType === "image/gif" ||
            file.size > (this.#options.maxInputBytes ?? 50 * 1024 * 1024)
        ) {
            return [];
        }
        const source = await this.#options.blobs.get(file.blobKey);
        if (!source) {
            return [];
        }
        const bytes = new Uint8Array(await new Response(source).arrayBuffer());
        const metadata = await this.#options.transformer.inspect(bytes, {
            strict: true,
            maxInputPixels: 40_000_000,
            timeoutMs: 10_000,
        });
        if (metadata.pages !== 1) {
            return [];
        }
        const variants: FileVariant[] = [];
        for (const width of PROFILE_WIDTHS[file.imageProfile].filter((candidate) => candidate <= metadata.width)) {
            const transformed = await this.#options.transformer.transform(bytes, {
                width,
                quality: 82,
                autoOrient: true,
                colourspace: "srgb",
                strict: true,
                maxInputPixels: 40_000_000,
                timeoutMs: 15_000,
            });
            const blobKey =
                "variants/" +
                file.contentHash +
                "/" +
                this.#options.transformer.encoderIdentity +
                "/" +
                width +
                ".webp";
            const stored = await this.#options.blobs.put(blobKey, transformed.bytes);
            variants.push({
                profile: file.imageProfile,
                width: transformed.width,
                height: transformed.height,
                mimeType: "image/webp",
                blobKey,
                size: stored.size,
            });
        }
        await this.#options.store.putFile({
            ...file,
            width: metadata.width,
            height: metadata.height,
            variants: variants.slice(0, 10),
            updatedAt: new Date().toISOString(),
        });
        return variants;
    }
}
