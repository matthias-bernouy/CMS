import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { TPage } from "cms-content/pages/interfaces/pages";
import {
    cmsPageDetails,
    cmsPageId,
    cmsPageRevision,
    type CmsPageDetails,
} from "cms-content/pages/core/contracts/pageDetails";
import { CmsPageNotFoundError } from "cms-content/pages/core/contracts/renamePage";

export interface CmsPageUpdateInput {
    readonly id: string;
    readonly expectedRevision: number;
    readonly title?: string;
    readonly description?: string;
    readonly content?: string;
    readonly tags?: readonly string[];
}

export async function updateCmsPage(
    repository: Pick<CmsRepository, "updatePage">,
    input: CmsPageUpdateInput,
): Promise<CmsPageDetails> {
    const id = cmsPageId(input.id);
    const expectedRevision = cmsPageRevision(input.expectedRevision);
    const patch: Partial<TPage> = { id };
    for (const key of ["title", "description", "content", "tags"] as const) {
        if (input[key] !== undefined) {
            Object.assign(patch, { [key]: input[key] });
        }
    }
    if (Object.keys(patch).length === 1) {
        throw new TypeError("A Page update must contain at least one change.");
    }
    const updated = await repository.updatePage(patch, expectedRevision);
    if (!updated) {
        throw new CmsPageNotFoundError(id);
    }
    return cmsPageDetails(updated);
}

export async function publishCmsPage(
    repository: Pick<CmsRepository, "updatePage">,
    input: { readonly id: string; readonly visible: boolean; readonly expectedRevision: number },
): Promise<CmsPageDetails> {
    const id = cmsPageId(input.id);
    const expectedRevision = cmsPageRevision(input.expectedRevision);
    if (typeof input.visible !== "boolean") {
        throw new TypeError("Invalid Page visibility.");
    }
    const updated = await repository.updatePage({ id, visible: input.visible }, expectedRevision);
    if (!updated) {
        throw new CmsPageNotFoundError(id);
    }
    return cmsPageDetails(updated);
}

export async function deleteCmsPage(
    repository: Pick<CmsRepository, "getPageById" | "deletePage">,
    input: { readonly id: string; readonly expectedRevision: number },
): Promise<{ readonly id: string; readonly deleted: true }> {
    const id = cmsPageId(input.id);
    const expectedRevision = cmsPageRevision(input.expectedRevision);
    if (!(await repository.getPageById(id))) {
        throw new CmsPageNotFoundError(id);
    }
    await repository.deletePage(id, expectedRevision);
    return { id, deleted: true };
}
