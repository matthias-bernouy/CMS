import { describe, expect, mock, test } from "bun:test";
import type { ControlCms } from "cms-control/ControlCms";
import { getPagesList } from "cms-control/core/content/page/getPagesList";

describe("getPagesList", () => {
    test("delegates the query and maps publication state for the admin table", async () => {
        const getPagesMetadata = mock(async () => [
            {
                id: "published-page",
                path: "/published",
                title: "Published page",
                tags: ["news"],
                visible: true,
            },
            {
                id: "draft-page",
                path: "/draft",
                title: "Draft page",
                tags: [],
                visible: false,
            },
        ]);
        const cms = { repository: { getPagesMetadata } } as unknown as ControlCms;
        const query = { tag: "news", sortBy: "path", sortOrder: "desc" } as const;

        const pages = await getPagesList(cms, query);

        expect(getPagesMetadata).toHaveBeenCalledWith(query);
        expect(pages).toEqual([
            {
                id: "published-page",
                path: "/published",
                title: "Published page",
                tags: ["news"],
                visibleLabel: "Published",
                visibleColor: "success",
            },
            {
                id: "draft-page",
                path: "/draft",
                title: "Draft page",
                tags: [],
                visibleLabel: "Draft",
                visibleColor: "secondary",
            },
        ]);
    });
});
