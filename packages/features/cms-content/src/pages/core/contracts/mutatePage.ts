import type { z } from "zod";
import type { pagesUpdateInputSchema } from "cms-content/application/schemas/pages/inputs";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import type { ContentRepository } from "cms-content/application/interfaces/ContentRepository";
import type { TPage } from "cms-content/pages/interfaces/pages";
import {
    cmsPageDetails,
    cmsPageId,
    cmsPageRevision,
    type CmsPageDetails,
} from "cms-content/pages/core/contracts/pageDetails";
import { CmsPageNotFoundError } from "cms-content/pages/core/contracts/renamePage";

export type CmsPageUpdateInput = z.input<typeof pagesUpdateInputSchema>;

export async function updateCmsPage(
    repository: Pick<ContentRepository, "updatePage">,
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
        throw new ContentValidationError("page", "A Page update must contain at least one change.", {
            code: "page.no_change",
        });
    }
    const updated = await repository.updatePage(patch, expectedRevision);
    if (!updated) {
        throw new CmsPageNotFoundError(id);
    }
    return cmsPageDetails(updated, updated.diagnostics ?? []);
}

export async function publishCmsPage(
    repository: Pick<ContentRepository, "updatePage">,
    input: { readonly id: string; readonly visible: boolean; readonly expectedRevision: number },
): Promise<CmsPageDetails> {
    const id = cmsPageId(input.id);
    const expectedRevision = cmsPageRevision(input.expectedRevision);
    if (typeof input.visible !== "boolean") {
        throw new ContentValidationError("visible", "Invalid Page visibility.", {
            code: "field.boolean",
            parameters: { field: "visible" },
        });
    }
    const updated = await repository.updatePage({ id, visible: input.visible }, expectedRevision);
    if (!updated) {
        throw new CmsPageNotFoundError(id);
    }
    return cmsPageDetails(updated, updated.diagnostics ?? []);
}

export async function deleteCmsPage(
    repository: Pick<ContentRepository, "getPageById" | "deletePage">,
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
