import { findPagesReferencingFile, CMS_CACHE_KEYS, publicPagePath, type TPage } from "@bernouy/cms-content";
import { cmsFilesByIdRef } from "@bernouy/cms-content/files/urls";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

type PageCacheDependencies = Pick<ControlCmsState, "repository" | "cache">;

async function invalidateUpdatedPage(
    dependencies: PageCacheDependencies,
    page: TPage,
    defaultLanguage?: string,
): Promise<void> {
    const language = defaultLanguage ?? (await dependencies.repository.getSystem()).site.language;
    const paths = new Set([page.path]);
    for (const [code, local] of Object.entries(page.paths ?? {})) {
        paths.add(publicPagePath(code, local, language));
    }
    for (const path of paths) {
        const key = CMS_CACHE_KEYS.page(path);
        dependencies.cache.delete(key);
        dependencies.cache.deleteMatching((candidate) => candidate.startsWith(`${key}:`));
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
export async function invalidatePagesReferencingFile(
    dependencies: PageCacheDependencies,
    fileId: string,
): Promise<void> {
    const ref = cmsFilesByIdRef(fileId); // precise: ids are unique, so a substring match is safe

    // The favicon lives in site settings, not page content — if it points at
    // this file, its `?v` changes on every page.
    const settings = await dependencies.repository.getSystem();
    if (settings.site?.favicon?.includes(ref)) {
        invalidateAllPages(dependencies);
        return;
    }
    const pages = await findPagesReferencingFile(dependencies.repository, fileId);
    if (pages.length === 0) {
        return;
    }
    const language = settings.site.language;
    await Promise.all(pages.map((page) => invalidateUpdatedPage(dependencies, page, language)));
}

/**
 * Invalidate every cached rendered page. Used when a global asset (theme
 * CSS, site settings) changes — the new hash affects every page's `<link>`
 * / `<script>` tags, so they all must be re-rendered.
 */
function invalidateAllPages(dependencies: PageCacheDependencies): void {
    dependencies.cache.deleteMatching((key) => key.startsWith("page:"));
}
