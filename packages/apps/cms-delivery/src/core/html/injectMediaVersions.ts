import type { CmsFilesMetadataRepository } from "@bernouy/cms-shared";

/** Matches `…/.cms/files/by-id/<id>` (any tenant prefix), capturing the id. */
const BY_ID_RE = /\/\.cms\/files\/by-id\/([^/?#]+)/;

/**
 * Append `?v=<contentHash>` to every `by-id` media URL in the rendered document.
 *
 * Media is addressed by an immutable, rename-proof id. To let a file's bytes be
 * updated *in place* (same id, new content) without serving stale bytes from the
 * year-long immutable cache, the renderer stamps the URL with the file's current
 * content hash — a new hash means a new URL, so the cache busts exactly when the
 * bytes change, while the stored content keeps the clean `/by-id/<id>`.
 *
 * The id stays stable, so this is purely a cache token. Hashes are resolved from
 * the files metadata, batched one lookup per distinct id. No-op when no files
 * backend is wired, or for a URL whose id has no hash (legacy row) — left as-is.
 */
export async function injectMediaVersions(
    document: Document,
    files: CmsFilesMetadataRepository | undefined,
): Promise<void> {
    if (!files) return;

    const targets: { el: Element; attr: string; id: string }[] = [];
    const collect = (selector: string, attr: string): void => {
        for (const el of Array.from(document.querySelectorAll(selector))) {
            const url = el.getAttribute(attr);
            const m = url ? BY_ID_RE.exec(url) : null;
            if (m) targets.push({ el, attr, id: decodeURIComponent(m[1]!) });
        }
    };
    collect("img[src]", "src");
    collect('link[rel="icon"]', "href");
    if (targets.length === 0) return;

    const hashById = new Map<string, string | undefined>();
    await Promise.all([...new Set(targets.map(t => t.id))].map(async (id) => {
        const item = await files.getItem(id);
        hashById.set(id, item?.type === "file" ? item.contentHash : undefined);
    }));

    for (const { el, attr, id } of targets) {
        const hash = hashById.get(id);
        if (!hash) continue;
        const url = el.getAttribute(attr)!;
        el.setAttribute(attr, url.includes("?") ? `${url}&v=${hash}` : `${url}?v=${hash}`);
    }
}
