import type { CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";
import type { CmsFilesMetadataRepository } from "cms-files/interfaces/CmsFilesMetadataRepository";
import { readManifest, type VariantManifest } from "cms-files/core/imageVariants";
import { cmsImageVariantBaseUrlFromByIdUrl, mediaIdFromUrl, withFileVersion } from "cms-files/core/fileUrls";

const DEFAULT_SIZES = "100vw";

const isRaster = (mime: string | undefined): boolean =>
    !!mime && mime.startsWith("image/") && mime !== "image/svg+xml";

type Target = { el: Element; attr: string; url: string; id: string };

/**
 * Finalize every `by-id` media URL in the rendered document, and report which
 * images still need optimizing.
 *
 * The stored content keeps clean `/.cms/files/by-id/<id>` URLs. Rendering adds
 * `?v=<contentHash>` and expands ready raster images to `/.cms/img` variants.
 */
export async function injectMediaVersions(
    document: Document,
    deps: { files?: CmsFilesMetadataRepository; variantStore?: CmsFilesBlobStore },
): Promise<string[]> {
    const { files, variantStore } = deps;
    if (!files) return [];

    const imgs: Target[] = [];
    const favicons: Target[] = [];
    const collect = (selector: string, attr: string, into: Target[]): void => {
        for (const el of Array.from(document.querySelectorAll(selector))) {
            const url = el.getAttribute(attr);
            const id = url ? mediaIdFromUrl(url) : null;
            if (id) into.push({ el, attr, url: url!, id });
        }
    };
    collect("img[src]", "src", imgs);
    collect('link[rel="icon"]', "href", favicons);
    if (imgs.length === 0 && favicons.length === 0) return [];

    const info = new Map<string, { hash?: string; mime?: string; manifest?: VariantManifest | null }>();
    await Promise.all([...new Set([...imgs, ...favicons].map(t => t.id))].map(async (id) => {
        const item = await files.getItem(id);
        info.set(id, { hash: item?.type === "file" ? item.contentHash : undefined, mime: item?.type === "file" ? item.mimeType : undefined });
    }));
    if (variantStore) {
        await Promise.all([...info].map(async ([, rec]) => {
            if (rec.hash && isRaster(rec.mime)) rec.manifest = await readManifest(variantStore, rec.hash);
        }));
    }

    for (const t of favicons) {
        const hash = info.get(t.id)?.hash;
        if (hash) t.el.setAttribute(t.attr, withFileVersion(t.url, hash));
    }

    const unoptimized = new Set<string>();
    for (const t of imgs) {
        const rec = info.get(t.id);
        const hash = rec?.hash;
        if (!hash) continue;

        if (variantStore && isRaster(rec!.mime) && rec!.manifest && rec!.manifest.widths.length > 0) {
            const variantBaseUrl = cmsImageVariantBaseUrlFromByIdUrl(t.url);
            if (variantBaseUrl) {
                t.el.setAttribute("srcset", rec!.manifest.widths
                    .map(w => `${withFileVersion(`${variantBaseUrl}/${w}.webp`, hash)} ${w}w`)
                    .join(", "));
                if (!t.el.getAttribute("sizes")) t.el.setAttribute("sizes", DEFAULT_SIZES);
                const dim = rec!.manifest.intrinsic;
                if (dim && !t.el.hasAttribute("width") && !t.el.hasAttribute("height")) {
                    t.el.setAttribute("width",  String(dim.width));
                    t.el.setAttribute("height", String(dim.height));
                }
            }
        }
        t.el.setAttribute("src", withFileVersion(t.url, hash));
        if (variantStore && isRaster(rec!.mime) && !rec!.manifest) unoptimized.add(t.id);
    }
    return [...unoptimized];
}
