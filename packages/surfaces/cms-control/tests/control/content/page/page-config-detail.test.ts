import { describe, expect, test } from "bun:test";
import type { TPage } from "@bernouy/cms-content";
import type { Source, SourceIndexingEntity } from "@bernouy/cms-sources";
import getConfigDetail from "cms-control/api/_content/page/_editing/configDetail.get";

function indexingEntity(id: string, sourceId: string, endpointId: string): SourceIndexingEntity {
    return {
        id,
        label: endpointId === "event" ? "Event" : "Product",
        resolve: {
            endpointUrn: `urn:${sourceId}:${endpointId}`,
            identity: { key: "slug", inputParam: "slug", outputPath: "slug" },
        },
        discover: {
            endpointUrn: `urn:${sourceId}:${endpointId}s`,
            itemsPath: "items",
            identityPath: "slug",
        },
        variables: {
            title: { path: "title", type: "text" },
            price: { path: "price", type: "number" },
        },
        defaults: {
            titleTemplate: "${content.title}",
            descriptionTemplate: "Buy ${content.title}",
        },
    };
}

const commerce: Source = {
    urn: "urn:commerce",
    meta: { name: "Commerce" },
    endpoints: [],
    indexing: { entities: [indexingEntity("product-by-slug", "commerce", "product")] },
};

const page: TPage = {
    id: "page-1",
    path: "/pricing",
    title: "Pricing",
    description: "Pricing page",
    content: '<main cms-source="/.cms/sources/commerce/product?slug=#{product}"></main>',
    visible: true,
    tags: ["pricing", "landing"],
    indexing: {
        enabled: true,
        entity: {
            sourceUrn: "urn:commerce",
            entityId: "product-by-slug",
            pageQueryParam: "product",
        },
    },
};

function cmsWithPage(existing: TPage | null, deliveryUrl?: string, sources: Source[] = [commerce]) {
    const requestedIds: string[] = [];
    const cms = {
        repository: {
            getPageById: async (id: string) => {
                requestedIds.push(id);
                return existing?.id === id ? existing : null;
            },
        },
        config: { deliveryUrl },
        optionalSources: {
            getAllSources: async () => sources,
        },
    };

    return { cms, requestedIds };
}

describe("GET /api/page/configDetail", () => {
    test("returns page metadata by id", async () => {
        const { cms, requestedIds } = cmsWithPage(page, "https://site.test");

        const response = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=page-1"),
            cms as any,
        );

        expect(response.status).toBe(200);
        expect(requestedIds).toEqual(["page-1"]);
        expect(await response.json()).toEqual({
            id: "page-1",
            title: "Pricing",
            description: "Pricing page",
            path: "/pricing",
            publicUrl: "https://site.test/pricing",
            tags: ["pricing", "landing"],
            published: true,
            indexing: page.indexing,
            indexingEditor: {
                configured: true,
                suggested: false,
                detectionStatus: "detected",
                enabled: true,
                selection: "urn%3Acommerce|product-by-slug|product",
                selectionValid: true,
                availableVariables: ["page.path", "site.host", "site.language", "site.name"],
                candidates: [
                    {
                        value: "urn%3Acommerce|product-by-slug|product",
                        label: "Product",
                        variables: ["content.price", "content.title"],
                        suggestedTitle: "${content.title}",
                        suggestedDescription: "Buy ${content.title}",
                    },
                ],
            },
        });
    });

    test("suggests the only detected entity without persisting it", async () => {
        const unconfiguredPage = { ...page, indexing: undefined };
        const { cms } = cmsWithPage(unconfiguredPage);

        const response = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=page-1"),
            cms as any,
        );
        const body = await response.json();

        expect(body.indexing).toBeUndefined();
        expect(body.indexingEditor).toMatchObject({
            configured: false,
            suggested: true,
            detectionStatus: "detected",
            enabled: true,
            selection: "urn%3Acommerce|product-by-slug|product",
        });
    });

    test("requires a choice when several entity bindings are detected", async () => {
        const events: Source = {
            urn: "urn:events",
            meta: { name: "Events" },
            endpoints: [],
            indexing: { entities: [indexingEntity("event-by-slug", "events", "event")] },
        };
        const ambiguousPage: TPage = {
            ...page,
            indexing: undefined,
            content: `
                <main cms-source="/.cms/sources/commerce/product?slug=#{item}"></main>
                <aside cms-source="/.cms/sources/events/event?slug=#{item}"></aside>
            `,
        };
        const { cms } = cmsWithPage(ambiguousPage, undefined, [commerce, events]);

        const response = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=page-1"),
            cms as any,
        );
        const body = await response.json();

        expect(body.indexingEditor).toMatchObject({
            configured: false,
            suggested: false,
            detectionStatus: "ambiguous",
            enabled: false,
            selection: "",
        });
        expect(body.indexingEditor.candidates).toHaveLength(2);
    });

    test("keeps indexing available for a static page", async () => {
        const staticPage = { ...page, indexing: undefined, content: "<main>About us</main>" };
        const { cms } = cmsWithPage(staticPage);

        const response = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=page-1"),
            cms as any,
        );
        const body = await response.json();

        expect(body.indexingEditor).toEqual({
            configured: false,
            suggested: false,
            detectionStatus: "none",
            enabled: true,
            selection: "",
            selectionValid: true,
            availableVariables: ["page.path", "site.host", "site.language", "site.name"],
            candidates: [],
        });
    });

    test("redirects to pages admin when id is missing", async () => {
        const { cms } = cmsWithPage(page);

        const response = await getConfigDetail(new Request("http://localhost/cms/api/page/configDetail"), cms as any);

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/cms/admin/pages");
    });

    test("redirects to pages admin when page does not exist", async () => {
        const { cms } = cmsWithPage(null);

        const response = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=missing"),
            cms as any,
        );

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/cms/admin/pages");
    });
});
