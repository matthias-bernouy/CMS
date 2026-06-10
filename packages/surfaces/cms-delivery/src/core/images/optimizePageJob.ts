import type { CmsFilesMetadataRepository, CmsFilesBlobStore } from "@bernouy/cms-files";
import { ensureVariants } from "cms-delivery/core/images/imageVariants";

/** Placeholder width ladder (B3). B4 replaces this with headless-measured,
 *  per-image widths; `ensureVariants` already caps each rung at the source. */
export const DEFAULT_LADDER = [320, 640, 960, 1280, 1920];

export type OptimizeDeps = {
    metadata:     CmsFilesMetadataRepository;
    sourceBlob:   CmsFilesBlobStore;
    variantStore: CmsFilesBlobStore;
};

/**
 * Generate the variant ladder + manifest for each image referenced on a page —
 * the body of a background optimization job. Skips non-raster (SVG) and
 * hashless/legacy rows; `ensureVariants` is idempotent, so an image already done
 * (e.g. shared with another page) is a no-op. Best-effort per image: one failure
 * doesn't abort the rest.
 */
export async function optimizePageImages(deps: OptimizeDeps, imageIds: string[], ladder: number[] = DEFAULT_LADDER): Promise<void> {
    for (const id of imageIds) {
        try {
            const item = await deps.metadata.getItem(id);
            if (!item || item.type !== "file" || !item.contentHash) continue;
            if (!item.mimeType.startsWith("image/") || item.mimeType === "image/svg+xml") continue;

            const stream = await deps.sourceBlob.get(item.id);
            if (!stream) continue;
            const source = new Uint8Array(await new Response(stream).arrayBuffer());
            await ensureVariants(deps.variantStore, item.contentHash, source, ladder);
        } catch { /* best-effort; the next render re-enqueues a still-missing image */ }
    }
}
