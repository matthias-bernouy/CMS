import type { z } from "zod";
import type { pagesCreateInputSchema } from "content/application/schemas/pages/inputs";
import { ContentValidationError } from "content/application/core/validation/errors";
import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import { cmsPageDetails, type CmsPageDetails } from "content/pages/core/contracts/pageDetails";
import { CmsPageNotFoundError } from "content/pages/core/contracts/renamePage";
import { validatePagePath, validatePageTitle } from "content/pages/core/validation/page";

export type CmsPageCreateInput = z.input<typeof pagesCreateInputSchema>;

export async function createCmsPage(
    repository: Pick<ContentRepository, "insertPage" | "getPage">,
    input: CmsPageCreateInput,
): Promise<CmsPageDetails> {
    const path = validatePagePath(input.path);
    const title = validatePageTitle(input.title);
    if (input.content !== undefined && typeof input.content !== "string") {
        throw new ContentValidationError("content", "Invalid Page content.", {
            code: "field.text",
            parameters: { field: "content" },
        });
    }
    const feedback = await repository.insertPage(path, title, input.content);
    const created = await repository.getPage(path);
    if (!created) {
        throw new CmsPageNotFoundError(path);
    }
    return cmsPageDetails(created, feedback?.diagnostics ?? []);
}
