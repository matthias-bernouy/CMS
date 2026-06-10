import type { CmsFilesMetadataRepository, CmsFilesBlobStore } from "@bernouy/cms-files";
import { readManifest, type VariantManifest } from "cms-delivery/core/images/imageVariants";

/** Matches `…/.cms/files/by-id/<id>` (any tenant prefix), capturing the id. */
const BY_ID_RE = /\/\.cms\/files\/by-id\/([^/?#]+)/;

/** Default `sizes` until B4 measures the real layout: assume the image can be
 *  viewport-wide. The `srcset` only offers widths up to the source, so this
 *  never over-fetches past the original. */
const DEFAULT_SIZES = "100vw";

const withVersion = (url: string, hash: string): string =>
    url.includes("?") ? `${url}&v=${hash}` : `${url}?v=${hash}`;

const isRaster = (mime: string | undefined): boolean =>
    !!mime && mime.startsWith("image/") && mime !== "image/svg+xml";

type Target = { el: Element; attr: string; url: string; id: string };

/**
 * Finalize every `by-id` media URL in the rendered document, and report which
 * images still need optimizing.
 *
 * - **Cache token**: every media URL gets `?v=<contentHash>` so an in-place file
 *   update busts the year-long immutable cache (the stored content keeps the
 *   clean `/by-id/<id>`; the id is stable, `?v` is purely the bust token).
 * - **Responsive `srcset`**: a raster `<img>` whose variants are ready (a
 *   manifest exists) is expanded to a `srcset` of `/.cms/img/<id>/<w>.webp?v=…`
 *   candidates + a `sizes` hint, keeping the original as the `src` fallback.
 * - **Background optimization**: a raster `<img>` with NO manifest yet is left
 *   on the original (served best-effort) and its id is RETURNED so the caller
 *   can enqueue generation — the page upgrades to the `srcset` on a later render.
 *
 * No-op without a files backend; SVGs / legacy rows (no hash) are left as-is.
 * Hashes + manifests are resolved batched, one lookup per distinct id.
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
            const m = url ? BY_ID_RE.exec(url) : null;
            if (m) into.push({ el, attr, url: url!, id: decodeURIComponent(m[1]!) });
        }
    };
    collect("img[src]", "src", imgs);
    collect('link[rel="icon"]', "href", favicons);
    if (imgs.length === 0 && favicons.length === 0) return [];

    // Resolve hash + mime (one getItem per distinct id), then the manifest for
    // raster images when a variant store is wired.
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
        if (hash) t.el.setAttribute(t.attr, withVersion(t.url, hash));
    }

    const unoptimized = new Set<string>();
    for (const t of imgs) {
        const rec = info.get(t.id);
        const hash = rec?.hash;
        if (!hash) continue; // legacy row without a hash → leave the URL untouched

        if (variantStore && isRaster(rec!.mime) && rec!.manifest && rec!.manifest.widths.length > 0) {
            const base = t.url.replace("/.cms/files/by-id/", "/.cms/img/"); // <prefix>/.cms/img/<id>
            t.el.setAttribute("srcset", rec!.manifest.widths.map(w => `${base}/${w}.webp?v=${hash} ${w}w`).join(", "));
            if (!t.el.getAttribute("sizes")) t.el.setAttribute("sizes", DEFAULT_SIZES);
            // Emit intrinsic w/h so the browser reserves the box before load
            // (kills CLS, makes lazy-loading reliable — see `VariantManifest.
            // intrinsic`). CSS still scales the display. Respect author-set dims.
            const dim = rec!.manifest.intrinsic;
            if (dim && !t.el.hasAttribute("width") && !t.el.hasAttribute("height")) {
                t.el.setAttribute("width",  String(dim.width));
                t.el.setAttribute("height", String(dim.height));
            }
        }
        t.el.setAttribute("src", withVersion(t.url, hash)); // fallback src (+ cache token)
        if (variantStore && isRaster(rec!.mime) && !rec!.manifest) unoptimized.add(t.id);
    }
    return [...unoptimized];
}
