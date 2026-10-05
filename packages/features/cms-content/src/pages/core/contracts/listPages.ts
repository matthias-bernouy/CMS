import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";

export interface CmsPagesListInput {
    readonly cursor?: string;
    readonly limit?: number;
}

export interface CmsPageListItem {
    readonly id: string;
    readonly revision: number;
    readonly surface: "control" | "delivery";
    readonly path: string;
    readonly title: string;
    readonly visible: boolean;
}

export interface CmsPagesListOutput {
    readonly items: readonly CmsPageListItem[];
    readonly nextCursor?: string;
}

/** Provider-neutral implementation of `ulvia.cms.pages/list`. */
export async function listCmsPages(
    repository: Pick<CmsRepository, "scanPages">,
    input: CmsPagesListInput,
): Promise<CmsPagesListOutput> {
    const cursor = input.cursor;
    const limit = input.limit ?? 50;
    if (cursor !== undefined && (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 256)) {
        throw new TypeError("Invalid Page cursor.");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError("Page list limit must be between 1 and 100.");
    }
    const page = await repository.scanPages(cursor, limit);
    return {
        items: page.pages.map(({ id, revision, surface, path, title, visible }) => ({
            id,
            revision,
            surface,
            path,
            title,
            visible,
        })),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
}
