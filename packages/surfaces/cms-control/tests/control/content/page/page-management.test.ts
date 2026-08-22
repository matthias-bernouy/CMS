import { describe, expect, test } from "bun:test";
import { P9R_CACHE, type TPage } from "@bernouy/cms-content";
import putConfigDetail from "cms-control/api/_content/page/_editing/configDetail.put";
import putPageContent from "cms-control/api/_content/page/_editing/content.put";

const existingPage: TPage = {
    id: "page-1",
    path: "/draft",
    title: "Draft",
    description: "Draft description",
    content: "<p>Original content</p>",
    visible: false,
    tags: ["existing"],
};

function makeCms() {
    const updates: TPage[] = [];
    const invalidations: string[] = [];
    const cms = {
        repository: {
            getPageById: async (id: string) => (id === existingPage.id ? existingPage : null),
            getPage: async (path: string) =>
                path === "/published" ? { ...existingPage, ...updates.at(-1), id: existingPage.id } : null,
            updatePage: async (page: TPage) => {
                updates.push(page);
            },
        },
        cache: {
            delete: (key: string) => {
                invalidations.push(key);
            },
        },
    };
    return { cms, updates, invalidations };
}

function jsonRequest(url: string, body: Record<string, unknown>): Request {
    return new Request(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("page management writes", () => {
    test("updates page settings without replacing visual content", async () => {
        const { cms, updates, invalidations } = makeCms();

        const response = await putConfigDetail(
            jsonRequest("http://localhost/cms/api/page/configDetail?id=page-1", {
                title: "Published",
                path: "/published",
                description: "Published description",
                published: "true",
                tags: "seo, landing",
            }),
            cms as never,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: existingPage.id });
        expect(updates).toEqual([
            {
                ...existingPage,
                title: "Published",
                path: "/published",
                description: "Published description",
                visible: true,
                tags: ["seo", " landing"],
            },
        ]);
        expect(updates[0]!.content).toBe(existingPage.content);
        expect(invalidations).toEqual([P9R_CACHE.page("/draft"), P9R_CACHE.page("/published")]);
    });

    test("updates visual content without replacing page settings", async () => {
        const { cms, updates, invalidations } = makeCms();

        const response = await putPageContent(
            jsonRequest("http://localhost/cms/api/page/content", {
                id: "page-1",
                content: "<main>Updated content</main>",
            }),
            cms as never,
        );

        expect(response.status).toBe(204);
        expect(updates).toEqual([{ ...existingPage, content: "<main>Updated content</main>" }]);
        expect(updates[0]!.title).toBe(existingPage.title);
        expect(invalidations).toEqual([P9R_CACHE.page("/draft")]);
    });
});
