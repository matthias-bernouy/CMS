import { describe, expect, test } from "bun:test";
import { P9R_CACHE, type TPage } from "@bernouy/cms-content";
import type { Source } from "@bernouy/cms-sources";
import putConfigDetail from "cms-control/api/_content/page/_editing/configDetail.put";
import putPageContent from "cms-control/api/_content/page/_editing/content.put";

const commerce: Source = {
    urn: "urn:commerce",
    endpoints: [],
    indexing: {
        entities: [
            {
                id: "product-by-slug",
                label: "Product",
                resolve: {
                    endpointUrn: "urn:commerce:product",
                    identity: { key: "slug", inputParam: "slug", outputPath: "slug" },
                },
                discover: {
                    endpointUrn: "urn:commerce:products",
                    itemsPath: "items",
                    identityPath: "slug",
                },
                variables: { title: { path: "title", type: "text" } },
            },
        ],
    },
};

const existingPage: TPage = {
    id: "page-1",
    path: "/draft",
    title: "Draft",
    description: "Draft description",
    content: '<main cms-source="/.cms/sources/commerce/product?slug=#{product}">Original content</main>',
    visible: false,
    tags: ["existing"],
    indexing: { enabled: false },
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
        optionalSources: {
            getAllSources: async () => [commerce],
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
                title: "${content.title} | Store",
                path: "/published",
                description: "Buy ${content.title}",
                published: "true",
                tags: "seo, landing",
                indexingEnabled: "true",
                indexingCandidate: "urn%3Acommerce|product-by-slug|product",
            }),
            cms as never,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: existingPage.id });
        expect(updates).toEqual([
            {
                ...existingPage,
                title: "${content.title} | Store",
                path: "/published",
                description: "Buy ${content.title}",
                visible: true,
                tags: ["seo", " landing"],
                indexing: {
                    enabled: true,
                    entity: {
                        sourceUrn: "urn:commerce",
                        entityId: "product-by-slug",
                        pageQueryParam: "product",
                    },
                },
            },
        ]);
        expect(updates[0]!.content).toBe(existingPage.content);
        expect(invalidations).toEqual([P9R_CACHE.page("/draft"), P9R_CACHE.page("/published")]);
    });

    test("rejects an entity binding that is no longer present in the page", async () => {
        const { cms, updates } = makeCms();

        await expect(
            putConfigDetail(
                jsonRequest("http://localhost/cms/api/page/configDetail?id=page-1", {
                    title: "Published",
                    path: "/published",
                    description: "Published description",
                    published: true,
                    tags: [],
                    indexingEnabled: "true",
                    indexingCandidate: "urn%3Acommerce|product-by-id|product",
                }),
                cms as never,
            ),
        ).rejects.toThrow("It no longer matches an indexable binding on this page.");
        expect(updates).toEqual([]);
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
        expect(updates[0]!.indexing).toEqual({ enabled: false });
        expect(invalidations).toEqual([P9R_CACHE.page("/draft")]);
    });
});
