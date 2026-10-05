import { describe, expect, test } from "bun:test";
import { CMS_CACHE_KEYS, type TPage } from "@bernouy/cms-content";
import type { GatewayEditorCapability } from "@bernouy/cms-gateway";
import putConfigDetail from "cms-control/api/_content/page/_editing/configDetail.put";
import putPageContent from "cms-control/api/_content/page/_editing/content.put";

const capability: GatewayEditorCapability = {
    contractId: "commerce",
    contractLabel: "Commerce",
    capabilityId: "product.get",
    description: "Product",
    providerId: "shop",
    providerLabel: "Shop",
    access: "public",
    effect: "query",
    input: { type: "object", properties: { slug: { type: "string", maxLength: 128 } }, required: ["slug"] },
    output: {
        type: "object",
        properties: { slug: { type: "string", maxLength: 128 }, title: { type: "string", maxLength: 128 } },
        required: ["slug"],
    },
};
const listCapability: GatewayEditorCapability = {
    ...capability,
    capabilityId: "product.list",
    description: "List products",
    input: { type: "object", properties: { limit: { type: "integer" }, offset: { type: "integer" } }, required: [] },
    output: {
        type: "object",
        properties: {
            items: {
                type: "array",
                items: { type: "object", properties: { slug: { type: "string", maxLength: 128 } }, required: ["slug"] },
                maxItems: 100,
            },
            total: { type: "integer" },
        },
        required: ["items"],
    },
};
const existingPage: TPage = {
    id: "page-1",
    revision: 1,
    surface: "delivery",
    path: "/draft",
    title: "Draft",
    description: "Draft description",
    content: `<main cms-source="/.cms/call/commerce/product.get" cms-source-method="POST" cms-source-body='{"slug":{"from":"queryParam","name":"product"}}'>Original content</main>`,
    visible: false,
    tags: ["existing"],
    indexing: { enabled: false },
};
function makeCms() {
    const updates: Partial<TPage>[] = [];
    const invalidations: string[] = [];
    return {
        cms: {
            repository: {
                getPageById: async (id: string) => (id === existingPage.id ? existingPage : null),
                getPage: async (path: string) => (path === "/draft" ? { ...existingPage, ...updates.at(-1) } : null),
                getSystem: async () => ({ site: { language: "fr" } }),
                updatePage: async (page: Partial<TPage>) => {
                    updates.push(page);
                },
            },
            config: {
                capabilityGateway: {
                    siteId: "site-test",
                    catalogue: { list: async () => [capability, listCapability] },
                },
            },
            cache: {
                deleteMatching: () => {},
                delete: (key: string) => {
                    invalidations.push(key);
                },
            },
        },
        updates,
        invalidations,
    };
}
function jsonRequest(url: string, body: Record<string, unknown>): Request {
    return new Request(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: 1, ...body }),
    });
}

describe("page management writes", () => {
    test("updates settings and projects a selected gateway binding", async () => {
        const { cms, updates, invalidations } = makeCms();
        const response = await putConfigDetail(
            jsonRequest("http://localhost/cms/api/page/configDetail?id=page-1", {
                title: "${content.title} | Store",
                path: "/draft",
                description: "Buy ${content.title}",
                published: "true",
                tags: "seo, landing",
                indexingEnabled: "true",
                indexingCandidate: "commerce|product.get|slug|product",
            }),
            cms as never,
        );
        expect(response.status).toBe(200);
        expect(updates[0]?.indexing).toEqual({
            enabled: true,
            entity: {
                contractId: "commerce",
                label: "Product",
                pageQueryParam: "product",
                resolve: { capabilityId: "product.get", inputParam: "slug", identityPath: "slug" },
                variables: { slug: { path: "slug", type: "text" }, title: { path: "title", type: "text" } },
            },
        });
        expect(updates[0]).not.toHaveProperty("content");
        expect(invalidations).toEqual([CMS_CACHE_KEYS.page("/draft")]);
    });

    test("rejects a candidate no longer present on the page", async () => {
        const { cms, updates } = makeCms();
        await expect(
            putConfigDetail(
                jsonRequest("http://localhost/cms/api/page/configDetail?id=page-1", {
                    title: "Published",
                    path: "/draft",
                    description: "Published description",
                    published: true,
                    tags: [],
                    indexingEnabled: "true",
                    indexingCandidate: "commerce|product.delete|slug|product",
                }),
                cms as never,
            ),
        ).rejects.toThrow("It no longer matches an indexable binding on this page.");
        expect(updates).toEqual([]);
    });

    test("saves explicit sitemap projections only when the selected contract declares them", async () => {
        const { cms, updates } = makeCms();
        const request = (itemsPath: string) =>
            jsonRequest("http://localhost/cms/api/page/configDetail?id=page-1", {
                title: "Product",
                path: "/draft",
                description: "",
                published: true,
                tags: [],
                indexingEnabled: "true",
                indexingCandidate: "commerce|product.get|slug|product",
                indexingProjection: JSON.stringify({
                    identityPath: "slug",
                    discover: {
                        capabilityId: "product.list",
                        itemsPath,
                        identityPath: "slug",
                        pagination: {
                            type: "offset",
                            limitParam: "limit",
                            offsetParam: "offset",
                            pageSize: 100,
                            totalPath: "total",
                        },
                    },
                }),
            });
        await expect(putConfigDetail(request("missing"), cms as never)).rejects.toThrow("list response");
        expect(updates).toEqual([]);
        const response = await putConfigDetail(request("items"), cms as never);
        expect(response.status).toBe(200);
        expect(updates[0]?.indexing?.entity?.discover).toEqual({
            capabilityId: "product.list",
            itemsPath: "items",
            identityPath: "slug",
            pagination: {
                type: "offset",
                limitParam: "limit",
                offsetParam: "offset",
                pageSize: 100,
                totalPath: "total",
            },
        });
    });

    test("validates direct indexing configuration against selected gateway schemas", async () => {
        const { cms, updates } = makeCms();
        const indexing = {
            enabled: true,
            entity: {
                contractId: "commerce",
                label: "Product",
                pageQueryParam: "product",
                resolve: { capabilityId: "product.get", inputParam: "slug", identityPath: "slug" },
                variables: {},
            },
        };
        const request = (value: unknown) =>
            jsonRequest("http://localhost/cms/api/page/configDetail?id=page-1", {
                title: "Product",
                path: "/draft",
                indexing: value,
            });
        await expect(
            putConfigDetail(
                request({ ...indexing, entity: { ...indexing.entity, contractId: "missing" } }),
                cms as never,
            ),
        ).rejects.toThrow("selected gateway capability");
        await expect(
            putConfigDetail(
                request({
                    ...indexing,
                    entity: { ...indexing.entity, resolve: { ...indexing.entity.resolve, identityPath: "missing" } },
                }),
                cms as never,
            ),
        ).rejects.toThrow("canonical identity field");
        expect(updates).toEqual([]);
        expect((await putConfigDetail(request(indexing), cms as never)).status).toBe(200);
        expect(updates[0]?.indexing).toEqual(indexing);
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
        expect(updates).toEqual([{ id: existingPage.id, content: "<main>Updated content</main>" }]);
        expect(invalidations).toEqual([CMS_CACHE_KEYS.page("/draft")]);
    });
});
