import type { ControlCms } from "src/control/ControlCms";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";

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
 * Invalidate every cached rendered page. Used when a global asset (theme
 * CSS, site settings) changes — the new hash affects every page's `<link>`
 * / `<script>` tags, so they all must be re-rendered.
 */
export function invalidateAllPages(cms: ControlCms): void {
    cms.cache.deleteMatching(key => key.startsWith("page:"));
}
