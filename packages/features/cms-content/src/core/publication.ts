import type { TPage } from "cms-content/interfaces/pages";

export function isPublishedPage(page: Pick<TPage, "visible"> | null | undefined): page is TPage {
    return page?.visible === true;
}
