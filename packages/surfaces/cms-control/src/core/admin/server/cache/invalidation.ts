import type { ControlCms } from "cms-control/ControlCms";
import { createBlocUsageResolver, findPagesReferencingText, P9R_CACHE } from "@bernouy/cms-content";
import { cmsFilesByIdRef } from "@bernouy/cms-files";

/**
 * Invalidate every cached rendered page that uses a bloc directly or through
 * another bloc's compiled template. The HTML carries immutable blocset hashes,
 * so a nested dependency update must regenerate every affected page.
 *
 * Pages that don't use the bloc are left untouched so they keep serving
 * from cache, and their existing image-optimization work is preserved.
 */
export async function invalidatePagesReferencingBloc(cms: ControlCms, blocTag: string): Promise<void> {
    const pages = await cms.repository.getAllPages();
    if (pages.length === 0) {
        return;
    }

    const blocList = await cms.repository.getBlocsList();
    const resolveUsage = createBlocUsageResolver(blocList, cms.repository);
    const usages = await Promise.all(pages.map((page) => resolveUsage(page.content)));
    pages.forEach((page, index) => {
        if (usages[index]?.includes(blocTag)) {
            cms.cache.delete(P9R_CACHE.page(page.path));
        }
    });
}

export function invalidateBlocAssets(cms: ControlCms, blocTag: string): void {
    cms.cache.delete(P9R_CACHE.bloc(blocTag));
    cms.cache.delete(P9R_CACHE.EDITOR_SCRIPT);
    cms.cache.delete(P9R_CACHE.EDITOR_VIEW_SCRIPT);
    cms.cache.deleteMatching((key) => key.startsWith(P9R_CACHE.BLOCSET_PREFIX));
}

export function invalidateUpdatedPage(cms: ControlCms, previousPath: string, nextPath: string): void {
    cms.cache.delete(P9R_CACHE.page(previousPath));
    if (nextPath !== previousPath) {
        cms.cache.delete(P9R_CACHE.page(nextPath));
    }
}

/**
 * Invalidate every cached rendered page that references a given file id —
 * directly (a `<img src="/.cms/files/by-id/<id>">`). Called after a file's
 * bytes are updated in place: the cached HTML carries the file's old
 * `?v=<contentHash>`, so it must regenerate to pick up the new hash. If the
 * file is the site favicon, every page changes → all.
 *
 * Pages that don't reference the file keep serving from cache.
 */
export async function invalidatePagesReferencingFile(cms: ControlCms, fileId: string): Promise<void> {
    const ref = cmsFilesByIdRef(fileId); // precise: ids are unique, so a substring match is safe

    // The favicon lives in site settings, not page content — if it points at
    // this file, its `?v` changes on every page.
    const settings = await cms.repository.getSystem();
    if (settings.site?.favicon?.includes(ref)) {
        invalidateAllPages(cms);
        return;
    }
    const pages = await findPagesReferencingText(cms.repository, ref);
    for (const page of pages) {
        cms.cache.delete(P9R_CACHE.page(page.path));
    }
}

/**
 * Invalidate every cached rendered page. Used when a global asset (theme
 * CSS, site settings) changes — the new hash affects every page's `<link>`
 * / `<script>` tags, so they all must be re-rendered.
 */
export function invalidateAllPages(cms: ControlCms): void {
    cms.cache.deleteMatching((key) => key.startsWith("page:"));
}
