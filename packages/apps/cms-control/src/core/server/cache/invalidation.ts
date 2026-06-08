import type { ControlCms } from "cms-control/ControlCms";
import { P9R_CACHE } from "@bernouy/cms-shared";

/**
 * Invalidate every cached rendered page that references a given bloc tag —
 * either directly in its content or transitively via a snippet that
 * contains the bloc. Called after a bloc is re-imported so the HTML — which
 * now points at an obsolete `?v=<hash>` for that bloc — is regenerated on
 * the next hit.
 *
 * Pages that don't use the bloc are left untouched so they keep serving
 * from cache, and their existing image-optimization work is preserved.
 */
export async function invalidatePagesReferencingBloc(cms: ControlCms, blocTag: string): Promise<void> {
    const directRe = new RegExp(`<${blocTag}(\\s|>|/)`, "i");

    const [pages, snippets] = await Promise.all([
        cms.repository.getAllPages(),
        cms.repository.getAllSnippets(),
    ]);

    // Snippets the bloc appears in — any page embedding one of these snippets
    // transitively depends on the bloc's current hash.
    const affectedSnippetIds = new Set(
        snippets.filter(s => directRe.test(s.content)).map(s => s.identifier),
    );

    for (const page of pages) {
        let matches = directRe.test(page.content);
        if (!matches && affectedSnippetIds.size > 0) {
            for (const id of affectedSnippetIds) {
                if (
                    page.content.includes(`identifier="${id}"`) ||
                    page.content.includes(`identifier='${id}'`)
                ) {
                    matches = true;
                    break;
                }
            }
        }
        if (matches) {
            cms.cache.delete(P9R_CACHE.page(page.path));
        }
    }
}

/**
 * Invalidate every cached rendered page that references a given file id —
 * directly (a `<img src="/.cms/files/by-id/<id>">`) or transitively via a
 * snippet. Called after a file's bytes are updated in place: the cached HTML
 * carries the file's old `?v=<contentHash>`, so it must regenerate to pick up
 * the new hash. If the file is the site favicon, every page changes → all.
 *
 * Pages that don't reference the file keep serving from cache.
 */
export async function invalidatePagesReferencingFile(cms: ControlCms, fileId: string): Promise<void> {
    const ref = `by-id/${fileId}`; // precise: ids are unique, so a substring match is safe

    const [pages, snippets, settings] = await Promise.all([
        cms.repository.getAllPages(),
        cms.repository.getAllSnippets(),
        cms.repository.getSystem(),
    ]);

    // The favicon lives in site settings, not page content — if it points at
    // this file, its `?v` changes on every page.
    if (settings.site?.favicon?.includes(ref)) { invalidateAllPages(cms); return; }

    const affectedSnippetIds = new Set(
        snippets.filter(s => s.content.includes(ref)).map(s => s.identifier),
    );

    for (const page of pages) {
        let matches = page.content.includes(ref);
        if (!matches && affectedSnippetIds.size > 0) {
            for (const id of affectedSnippetIds) {
                if (
                    page.content.includes(`identifier="${id}"`) ||
                    page.content.includes(`identifier='${id}'`)
                ) {
                    matches = true;
                    break;
                }
            }
        }
        if (matches) {
            cms.cache.delete(P9R_CACHE.page(page.path));
        }
    }
}

/**
 * Invalidate every cached rendered page. Used when a global asset (theme
 * CSS, site settings) changes — the new hash affects every page's `<link>`
 * / `<script>` tags, so they all must be re-rendered.
 */
export function invalidateAllPages(cms: ControlCms): void {
    cms.cache.deleteMatching(key => key.startsWith("page:"));
}
