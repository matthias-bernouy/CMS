import type { ControlCms } from "src/control/ControlCms";

export type PageListItem = {
    id: string;
    path: string;
    title: string;
    tags: string[];
    visibleLabel: string;
    visibleColor: string;
};

/**
 * View-model for the admin Pages table. Hands back exactly what the
 * `<cms-fetch>` template needs and nothing more — `repository.getPagesMetadata()`
 * is narrow on purpose (no `content` / `description`), and the boolean
 * `visible` is mapped here to a label + p9r-tag color so the HTML stays
 * a flat `{{ visibleLabel }}` / `{{ visibleColor }}` interpolation.
 */
export async function getPagesList(cms: ControlCms): Promise<PageListItem[]> {
    const pages = await cms.repository.getPagesMetadata();
    return pages.map(p => ({
        id:           p.id,
        path:         p.path,
        title:        p.title,
        tags:         p.tags,
        visibleLabel: p.visible ? "Published" : "Draft",
        visibleColor: p.visible ? "success"   : "secondary",
    }));
}
