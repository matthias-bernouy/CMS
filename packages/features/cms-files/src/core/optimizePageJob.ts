import type { CmsFilesMetadataRepository } from "cms-files/interfaces/CmsFilesMetadataRepository";
import type { CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";
import { ensureVariants } from "cms-files/core/imageVariants";

/** Default width ladder. `ensureVariants` caps each rung at the source width. */
export const DEFAULT_LADDER = [320, 640, 960, 1280, 1920];

export type OptimizeDeps = {
    metadata:     CmsFilesMetadataRepository;
    sourceBlob:   CmsFilesBlobStore;
    variantStore: CmsFilesBlobStore;
};

/**
 * Generate the variant ladder + manifest for each image referenced on a page —
 * the body of a background optimization job. Skips non-raster (SVG) and
 * files without a content hash; `ensureVariants` is idempotent, so an image
 * already done (e.g. shared with another page) is a no-op. Best-effort per
 * image: one failure doesn't abort the rest.
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
