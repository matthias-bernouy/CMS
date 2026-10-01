import type { ControlCms } from "cms-control/ControlCms";
import {
    createBlocUsageResolver,
    findPagesReferencingText,
    P9R_CACHE,
    publicPagePath,
    type TPage,
} from "@bernouy/cms-content";
import { cmsFilesByIdRef } from "@bernouy/cms-content/files/urls";

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

    const blocList = await cms.repository.getBlocsList({ includeInactive: true });
    const resolveUsage = createBlocUsageResolver(blocList, cms.repository);
    const usages = await Promise.all(pages.map((page) => resolveUsage(page.content)));
    const affected = pages.filter((_, index) => usages[index]?.includes(blocTag));
    if (affected.length === 0) {
        return;
    }
    const language = (await cms.repository.getSystem()).site.language;
    await Promise.all(affected.map((page) => invalidateUpdatedPage(cms, page, language)));
}

export function invalidateBlocAssets(cms: ControlCms, blocTag: string): void {
    cms.cache.delete(P9R_CACHE.bloc(blocTag));
    cms.cache.deleteMatching((key) => key.startsWith(P9R_CACHE.BLOCSET_PREFIX));
}

export async function invalidateUpdatedPage(cms: ControlCms, page: TPage, defaultLanguage?: string): Promise<void> {
    const language = defaultLanguage ?? (await cms.repository.getSystem()).site.language;
    const paths = new Set([page.path]);
    for (const [code, local] of Object.entries(page.paths ?? {})) {
        paths.add(publicPagePath(code, local, language));
    }
    for (const path of paths) {
        const key = P9R_CACHE.page(path);
        cms.cache.delete(key);
        cms.cache.deleteMatching((candidate) => candidate.startsWith(`${key}:`));
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
    if (pages.length === 0) {
        return;
    }
    const language = settings.site.language;
    await Promise.all(pages.map((page) => invalidateUpdatedPage(cms, page, language)));
}

/**
 * Invalidate every cached rendered page. Used when a global asset (theme
 * CSS, site settings) changes — the new hash affects every page's `<link>`
 * / `<script>` tags, so they all must be re-rendered.
 */
export function invalidateAllPages(cms: ControlCms): void {
    cms.cache.deleteMatching((key) => key.startsWith("page:"));
}

/** Invalidate a global stylesheet and every page carrying its content hash. */
export function invalidateGlobalStyleAndPages(cms: ControlCms): void {
    cms.cache.delete(P9R_CACHE.STYLE);
    invalidateAllPages(cms);
}
