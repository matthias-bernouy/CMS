import type { ControlCms } from "cms-control/ControlCms";
import type { PagesQuery } from "@bernouy/cms-content";

export type PageListItem = {
    id: string;
    path: string;
    title: string;
    tags: string[];
    visibleLabel: string;
    visibleColor: string;
};

/** Filter + sort options, owned by the repository (`CmsRepository.PagesQuery`).
 *  Re-exported under the name the API layer already imports. */
export type PageListOptions = PagesQuery;

/**
 * View-model for the admin Pages table. Filtering + sorting now live in the
 * repository (`getPagesMetadata(opts)`), so each storage engine handles them
 * optimally (Mongo in-query, in-memory in JS). This stays a thin mapper:
 * `repository.getPagesMetadata` is narrow on purpose (no `content`), and the
 * boolean `visible` becomes a label + p9r-tag color for the flat template.
 */
export async function getPagesList(cms: ControlCms, opts: PageListOptions = {}): Promise<PageListItem[]> {
    const pages = await cms.repository.getPagesMetadata(opts);
    return pages.map(p => ({
        id:           p.id,
        path:         p.path,
        title:        p.title,
        tags:         p.tags,
        visibleLabel: p.visible ? "Published" : "Draft",
        visibleColor: p.visible ? "success"   : "secondary",
    }));
}
