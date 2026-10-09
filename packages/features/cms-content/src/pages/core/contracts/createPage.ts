import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { cmsPageDetails, type CmsPageDetails } from "cms-content/pages/core/contracts/pageDetails";
import { CmsPageNotFoundError } from "cms-content/pages/core/contracts/renamePage";
import { validatePagePath, validatePageTitle } from "cms-content/pages/core/validation/page";
import type { PageSurface } from "cms-content/pages/interfaces/document";

export interface CmsPageCreateInput {
    readonly path: string;
    readonly title: string;
    readonly content?: string;
    readonly surface?: PageSurface;
}

export async function createCmsPage(
    repository: Pick<CmsRepository, "insertPage" | "getPage">,
    input: CmsPageCreateInput,
): Promise<CmsPageDetails> {
    const path = validatePagePath(input.path);
    const title = validatePageTitle(input.title);
    const surface = input.surface ?? "delivery";
    if (surface !== "control" && surface !== "delivery") {
        throw new TypeError("Invalid Page surface.");
    }
    if (input.content !== undefined && typeof input.content !== "string") {
        throw new TypeError("Invalid Page content.");
    }
    await repository.insertPage(path, title, input.content, { surface });
    const created = await repository.getPage(path);
    if (!created) {
        throw new CmsPageNotFoundError(path);
    }
    return cmsPageDetails(created);
}
