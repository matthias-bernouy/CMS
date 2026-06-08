import type { CmsFilesBlobStore } from "@bernouy/cms-shared";

/** V1 ships WebP only (fast encode); AVIF is a later add. */
export type VariantFormat = "webp";

export type VariantSpec = {
    /** Target width in px. Never upscales past the source's intrinsic width. */
    width:    number;
    format:   VariantFormat;
    /** Encoder quality (1–100). Defaults to 75. */
    quality?: number;
};

/**
 * Resize + re-encode an image to a single variant. No upscaling — a width past
 * the source's intrinsic width yields the source resolution, so the returned
 * `width` is the ACTUAL output width (which the caller uses to label/dedupe the
 * `srcset`, never offering a candidate larger than the original).
 *
 * `sharp` is lazy-imported so this module stays cheap to load: only the code
 * paths that actually generate (the worker / a cache miss) pull in libvips.
 */
export async function generateImageVariant(source: Uint8Array, spec: VariantSpec): Promise<{ bytes: Uint8Array; width: number; height: number }> {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(source)
        .resize({ width: spec.width, withoutEnlargement: true })
        .webp({ quality: spec.quality ?? 75 })
        .toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Content-addressed blob key for a variant. FLAT (no `/`) on purpose: the
 * variant store is a dedicated blob store, and `LocalFsCmsFilesBlob` rejects
 * slash-bearing keys (its anti-traversal guard for opaque ids). Keyed by the
 * source's `contentHash`, so it is immutable — the hash changes when the bytes
 * change, so a cached variant can never go stale (and identical sources dedupe).
 */
export function variantKey(contentHash: string, spec: VariantSpec): string {
    return `${contentHash}-${spec.width}.${spec.format}`;
}

/** What variants exist for a source, recorded by the worker and read by the
 *  renderer to build the `srcset`. `widths` are the DISTINCT ACTUAL widths
 *  produced (ascending), capped at the source's intrinsic width. */
export type VariantManifest = { format: VariantFormat; widths: number[] };

export function manifestKey(contentHash: string): string {
    return `${contentHash}-manifest.json`;
}

export async function readManifest(store: CmsFilesBlobStore, contentHash: string): Promise<VariantManifest | null> {
    const blob = await store.get(manifestKey(contentHash));
    if (!blob) return null;
    try { return JSON.parse(await new Response(blob).text()) as VariantManifest; }
    catch { return null; }
}

/**
 * Generate a whole ladder for one image and record the manifest — the worker's
 * per-image unit of work. Idempotent: if a manifest already exists it returns it
 * untouched (so re-running a page job, or a second page using the same image,
 * does no work). Dedupes by ACTUAL output width: a ladder rung past the source
 * width collapses onto the source width instead of producing a mislabelled
 * upscale. Writes each variant + the manifest into the shared store.
 */
export async function ensureVariants(
    store: CmsFilesBlobStore,
    contentHash: string,
    source: Uint8Array,
    ladder: number[],
): Promise<VariantManifest> {
    const existing = await readManifest(store, contentHash);
    if (existing) return existing;

    const widths = new Set<number>();
    for (const rung of ladder) {
        const { bytes, width } = await generateImageVariant(source, { width: rung, format: "webp" });
        if (widths.has(width)) continue;       // ladder rung past the source → same bytes, skip
        widths.add(width);
        await store.put(variantKey(contentHash, { width, format: "webp" }), bytes);
    }
    const manifest: VariantManifest = { format: "webp", widths: [...widths].sort((a, b) => a - b) };
    await store.put(manifestKey(contentHash), new TextEncoder().encode(JSON.stringify(manifest)));
    return manifest;
}
