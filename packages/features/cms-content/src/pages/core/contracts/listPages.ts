import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";

export interface CmsPagesListInput {
    readonly cursor?: string;
    readonly limit?: number;
    readonly query?: string;
    readonly visibility?: "all" | "published" | "draft";
}

export interface CmsPageListItem {
    readonly id: string;
    readonly path: string;
    readonly title: string;
    readonly visible: boolean;
}

export interface CmsPagesListOutput {
    readonly items: readonly CmsPageListItem[];
    readonly nextCursor?: string;
}

/** Provider-neutral implementation of `ulvia.cms.content/pages.list`. */
export async function listCmsPages(
    repository: Pick<CmsRepository, "getPagesMetadata">,
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
    const query = input.query?.trim();
    if (query !== undefined && query.length > 120) {
        throw new TypeError("Page list query must not exceed 120 characters.");
    }
    const visibility = input.visibility ?? "all";
    if (!(["all", "published", "draft"] as const).includes(visibility)) {
        throw new TypeError("Invalid Page visibility filter.");
    }
    const pages = await repository.getPagesMetadata({
        ...(query ? { search: query } : {}),
        ...(visibility === "all" ? {} : { visible: visibility }),
        sortBy: "title",
        sortOrder: "asc",
        ...(cursor ? { afterId: cursor } : {}),
        limit: limit + 1,
    });
    const items = pages.slice(0, limit);
    return {
        items: items.map(({ id, path, title, visible }) => ({
            id,
            path,
            title,
            visible,
        })),
        ...(pages.length > limit ? { nextCursor: items.at(-1)!.id } : {}),
    };
}
