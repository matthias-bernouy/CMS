import { describe, expect, test } from "bun:test";
import type { TPage } from "@bernouy/cms-content";
import type { GatewayEditorCapability } from "@bernouy/cms-gateway";
import getConfigDetail from "cms-control/api/_content/page/_editing/configDetail.get";

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
        properties: {
            slug: { type: "string", maxLength: 128 },
            title: { type: "string", maxLength: 128 },
            price: { type: "number" },
        },
        required: ["slug"],
    },
};
const binding = `<main cms-source="/.cms/call/commerce/product.get" cms-source-method="POST" cms-source-body='{"slug":{"from":"queryParam","name":"product"}}'></main>`;
const page: TPage = {
    id: "page-1",
    path: "/pricing",
    title: "Pricing",
    description: "Pricing page",
    content: binding,
    visible: true,
    tags: ["pricing", "landing"],
    indexing: {
        enabled: true,
        entity: {
            contractId: "commerce",
            label: "Product",
            pageQueryParam: "product",
            resolve: { capabilityId: "product.get", inputParam: "slug", identityPath: "slug" },
            variables: { title: { path: "title", type: "text" } },
        },
    },
};

function cmsWithPage(
    existing: TPage | null,
    deliveryUrl?: string,
    capabilities: GatewayEditorCapability[] = [capability],
) {
    const requestedIds: string[] = [];
    return {
        cms: {
            repository: {
                getPageById: async (id: string) => {
                    requestedIds.push(id);
                    return existing?.id === id ? existing : null;
                },
            },
            config: {
                deliveryUrl,
                capabilityGateway: { siteId: "site-test", catalogue: { list: async () => capabilities } },
            },
        },
        requestedIds,
    };
}

describe("GET /api/page/configDetail", () => {
    test("returns page metadata and matching gateway indexing candidate", async () => {
        const { cms, requestedIds } = cmsWithPage(page, "https://site.test");
        const response = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=page-1"),
            cms as never,
        );
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(requestedIds).toEqual(["page-1"]);
        expect(body.publicUrl).toBe("https://site.test/pricing");
        expect(body.indexing).toEqual(page.indexing);
        expect(body.indexingEditor).toMatchObject({
            configured: true,
            detectionStatus: "detected",
            selection: "commerce|product.get|slug|product",
            selectionValid: true,
        });
        expect(body.indexingEditor.candidates[0]).toMatchObject({
            label: "Product",
            variables: ["content.slug", "content.title", "content.price"],
        });
    });

    test("suggests a sole selected capability but requires a choice when ambiguous", async () => {
        const unconfigured = { ...page, indexing: undefined };
        const first = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=page-1"),
            cmsWithPage(unconfigured).cms as never,
        );
        expect((await first.json()).indexingEditor).toMatchObject({ suggested: true, detectionStatus: "detected" });
        const event = { ...capability, contractId: "events", capabilityId: "event.get", description: "Event" };
        const ambiguous = {
            ...unconfigured,
            content: binding + binding.replaceAll("commerce/product.get", "events/event.get"),
        };
        const second = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=page-1"),
            cmsWithPage(ambiguous, undefined, [capability, event]).cms as never,
        );
        expect((await second.json()).indexingEditor).toMatchObject({
            suggested: false,
            detectionStatus: "ambiguous",
            enabled: false,
        });
    });

    test("keeps static page indexing available and redirects for unknown pages", async () => {
        const staticPage = { ...page, indexing: undefined, content: "<main>About</main>" };
        const response = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=page-1"),
            cmsWithPage(staticPage).cms as never,
        );
        expect((await response.json()).indexingEditor).toMatchObject({
            detectionStatus: "none",
            enabled: true,
            candidates: [],
        });
        const missing = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=missing"),
            cmsWithPage(null).cms as never,
        );
        expect(missing.status).toBe(302);
    });
});
