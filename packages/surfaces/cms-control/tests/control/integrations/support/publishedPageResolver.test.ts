import { describe, expect, test } from "bun:test";
import { publishedPageResolver } from "cms-control/core/management/integrations/publishedPageResolver";
import type { TPage } from "@bernouy/cms-content";

const page: TPage = {
    id: "legal-page",
    path: "/terms",
    title: "Terms",
    description: "Terms of sale",
    content: "<main>Terms</main>",
    visible: true,
    tags: [],
};

describe("publishedPageResolver", () => {
    test("derives the immutable snapshot URL from the configured Delivery base path", async () => {
        const resolve = publishedPageResolver(repository(), "https://site.example.test/cms/courtside/");

        expect(await resolve("/terms")).toEqual({
            id: page.id,
            path: page.path,
            title: page.title,
            description: page.description,
            content: page.content,
            publishedSnapshotUrl:
                "https://site.example.test/cms/courtside/.cms/content/published-page-snapshot?id=legal-page",
        });
    });

    test("does not invent a snapshot URL when Delivery is not configured", async () => {
        const resolved = await publishedPageResolver(repository())("/terms");

        expect(resolved).not.toHaveProperty("publishedSnapshotUrl");
    });
});

function repository() {
    return {
        getPublishedPage: async (path: string) => (path === page.path ? structuredClone(page) : null),
    };
}
