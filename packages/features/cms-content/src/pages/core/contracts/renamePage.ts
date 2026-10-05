import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { PageRevisionConflictError } from "cms-content/application/core/validation/errors";
import { validatePageTitle } from "cms-content/pages/core/validation/page";
import type { CmsPageListItem } from "cms-content/pages/core/contracts/listPages";
import type { TPage } from "cms-content/pages/interfaces/pages";

export interface CmsPageRenameInput {
    readonly id: string;
    readonly title: string;
    readonly expectedRevision: number;
}

export class CmsPageNotFoundError extends Error {
    constructor(readonly pageId: string) {
        super("CMS Page was not found.");
        this.name = "CmsPageNotFoundError";
    }
}

/** Provider-neutral, naturally idempotent implementation of `ulvia.cms.pages/rename`. */
export async function renameCmsPage(
    repository: Pick<CmsRepository, "getPageById" | "updatePage">,
    input: CmsPageRenameInput,
): Promise<CmsPageListItem> {
    if (typeof input.id !== "string" || input.id.length === 0 || input.id.length > 200) {
        throw new TypeError("Invalid Page id.");
    }
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
        throw new TypeError("Invalid expected Page revision.");
    }
    const title = validatePageTitle(input.title);
    try {
        const updated = await repository.updatePage({ id: input.id, title }, input.expectedRevision);
        if (!updated) {
            throw new CmsPageNotFoundError(input.id);
        }
        return pageItem(updated);
    } catch (error) {
        if (!(error instanceof PageRevisionConflictError)) {
            throw error;
        }
        const current = await repository.getPageById(input.id);
        if (current?.revision === input.expectedRevision + 1 && current.title === title) {
            return pageItem(current);
        }
        throw error;
    }
}

function pageItem(page: TPage): CmsPageListItem {
    return {
        id: page.id,
        revision: page.revision,
        surface: page.surface,
        path: page.path,
        title: page.title,
        visible: page.visible,
    };
}
