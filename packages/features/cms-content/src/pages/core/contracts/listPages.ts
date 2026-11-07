import type { z } from "zod";
import type { pagesListInputSchema } from "cms-content/application/schemas/pages/inputs";
import type { pagesListOutputSchema } from "cms-content/application/schemas/pages/outputs";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import type { ContentRepository } from "cms-content/application/interfaces/ContentRepository";

export type CmsPagesListInput = z.input<typeof pagesListInputSchema>;

export type CmsPageListItem = CmsPagesListOutput["items"][number];

export type CmsPagesListOutput = z.output<typeof pagesListOutputSchema>;

/** Provider-neutral implementation of `ulvia/cms.content/pages.list`. */
export async function listCmsPages(
    repository: Pick<ContentRepository, "getPagesMetadata">,
    input: CmsPagesListInput,
): Promise<CmsPagesListOutput> {
    const cursor = input.cursor;
    const limit = input.limit ?? 50;
    if (cursor !== undefined && (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 256)) {
        throw new ContentValidationError("cursor", "Invalid Page cursor.");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new ContentValidationError("limit", "Page list limit must be between 1 and 100.");
    }
    const query = input.query?.trim();
    if (query !== undefined && query.length > 120) {
        throw new ContentValidationError("query", "Page list query must not exceed 120 characters.", {
            code: "field.too_long",
            parameters: { field: "query", max: 120 },
        });
    }
    const visibility = input.visibility ?? "all";
    if (!(["all", "published", "draft"] as const).includes(visibility)) {
        throw new ContentValidationError("visible", "Invalid Page visibility filter.");
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
