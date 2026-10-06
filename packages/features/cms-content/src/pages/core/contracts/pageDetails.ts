import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { TPage } from "cms-content/pages/interfaces/pages";
import { CmsPageNotFoundError } from "cms-content/pages/core/contracts/renamePage";

export type CmsPageDetails = Pick<
    TPage,
    "id" | "revision" | "surface" | "path" | "title" | "description" | "content" | "tags" | "visible"
>;

export async function getCmsPage(
    repository: Pick<CmsRepository, "getPageById">,
    input: { readonly id: string },
): Promise<CmsPageDetails> {
    const id = cmsPageId(input.id);
    const page = await repository.getPageById(id);
    if (!page) {
        throw new CmsPageNotFoundError(id);
    }
    return cmsPageDetails(page);
}

export function cmsPageId(value: unknown): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 200) {
        throw new TypeError("Invalid Page id.");
    }
    return value;
}

export function cmsPageRevision(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1) {
        throw new TypeError("Invalid expected Page revision.");
    }
    return value as number;
}

export function cmsPageDetails(page: TPage): CmsPageDetails {
    return {
        id: page.id,
        revision: page.revision,
        surface: page.surface,
        path: page.path,
        title: page.title,
        description: page.description,
        content: page.content,
        tags: [...page.tags],
        visible: page.visible,
    };
}
