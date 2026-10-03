import { isPublishedPage } from "cms-content/pages/core/lifecycle/publication";
import type { TPage } from "cms-content/pages/interfaces/pages";

/** Projects a page observed as published to the fields public rendering uses. */
export function projectPublishedPage(page: TPage | null): TPage | null {
    if (!isPublishedPage(page)) {
        return null;
    }
    return structuredClone({
        id: page.id,
        revision: page.revision,
        path: page.path,
        ...(page.paths ? { paths: page.paths } : {}),
        title: page.title,
        description: page.description,
        content: page.content,
        ...(page.seo ? { seo: page.seo } : {}),
        tags: page.tags,
        ...(page.indexing ? { indexing: page.indexing } : {}),
        visible: true,
    });
}
