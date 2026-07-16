import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";

describe("@bernouy/cms-integrations runtime artifact imports", () => {
    test("imports trigger, overlay, relation and dashboard relation artifacts", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const triggers = new InMemoryTriggerRepository();
        const dashboards = new InMemoryDashboardRepository();
        const sourceOverlays = new InMemorySourceOverlayRepository();
        const relations = new InMemoryRelationRepository();
        const secrets = new InMemorySecretStore();
        const definition = runtimeArtifactsDefinition();

        const result = await importIntegration(
            { sources, functions, triggers, dashboards, sourceOverlays, relations, secrets },
            { kind: "products-offers-link", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toContainEqual({ type: "trigger", id: "sync-offers", action: "created" });
        expect(result.artifacts).toContainEqual({ type: "sourceOverlay", id: "product-offers-fields", action: "created" });
        expect(result.artifacts).toContainEqual({ type: "relation", id: "product-offers", action: "created" });
        expect(result.artifacts).toContainEqual({
            type: "dashboardRelation",
            id: "products:productDetail:product-offers",
            action: "created",
        });
        expect(await triggers.getTrigger("sync-offers")).toMatchObject({ enabled: true });
        expect(await sourceOverlays.getOverlay("product-offers-fields")).toMatchObject({ sourceId: "products" });
        expect(await relations.getRelation("product-offers")).toMatchObject({ from: { sourceId: "products" } });
        expect(await relations.getDashboardRelationProjection("products:productDetail:product-offers")).toMatchObject({
            relationId: "product-offers",
            widget: "table",
        });
    });
});

function runtimeArtifactsDefinition(): IntegrationDefinition {
    return {
        kind: "products-offers-link",
        label: "Products offers link",
        inputs: [],
        artifacts: [
            sourceArtifact("products", "Products", [{ endpointId: "product", params: [] }]),
            sourceArtifact("offers", "Offers", [{
                endpointId: "offers",
                params: [
                    { name: "productId", type: "string" },
                    { name: "limit", type: "number" },
                    { name: "offset", type: "number" },
                ],
            }]),
            { type: "function", function: { id: "syncOffers", method: "POST", steps: [], return: { status: 204 } } },
            {
                type: "trigger",
                trigger: {
                    id: "sync-offers",
                    event: { kind: "endpoint", source: "products", endpoint: "product", phase: "response" },
                    function: { id: "syncOffers", params: { productId: "$response.body.id" } },
                },
            },
            { type: "sourceOverlay", overlay: productOverlay() },
            { type: "dashboard", dashboard: productDashboard() },
            { type: "relation", relation: productOffersRelation() },
            {
                type: "dashboardRelation",
                projection: {
                    type: "dashboardRelation",
                    relationId: "product-offers",
                    dashboardId: "products",
                    viewId: "productDetail",
                    widget: "table",
                },
            },
        ],
    };
}

type Endpoint = { endpointId: string; params: Array<{ name: string; type: "string" | "number" }> };
type Artifact = NonNullable<IntegrationDefinition["artifacts"]>[number];

function sourceArtifact(id: string, name: string, endpoints: Endpoint[]): Artifact {
    return {
        type: "source",
        source: {
            id,
            meta: { name },
            endpoints: endpoints.map(endpoint => ({
                endpointId: endpoint.endpointId,
                method: "GET",
                targetUrl: `https://api.example.com/${id}/${endpoint.endpointId}`,
                params: endpoint.params.map(param => ({ ...param, in: "query" })),
                output: [{ status: "200", body: { type: "object" } }],
            })),
        },
    };
}

function productOverlay(): Extract<Artifact, { type: "sourceOverlay" }>["overlay"] {
    return {
        id: "product-offers-fields",
        sourceId: "products",
        output: [{ endpointId: "product" }],
        fields: [{ id: "offerCount", label: "Offer count", type: "number" }],
    };
}

function productDashboard(): Extract<Artifact, { type: "dashboard" }>["dashboard"] {
    return {
        id: "products",
        source: "products",
        views: [{
            widget: "w-detail",
            id: "productDetail",
            source: { endpoint: "product", itemPath: "item" },
            main: [{ id: "details", title: "Details", fields: [{ id: "title", label: "Title", type: "text", path: "title" }] }],
        }],
    };
}

function productOffersRelation(): Extract<Artifact, { type: "relation" }>["relation"] {
    return {
        id: "product-offers",
        from: { sourceId: "products", idPath: "id" },
        to: { sourceId: "offers", idPath: "id" },
        cardinality: "many",
        binding: { kind: "reference", endpoint: { sourceId: "offers", endpointId: "offers" }, params: { productId: "$from.id" } },
        page: { itemsPath: "items", limitParam: "limit", offsetParam: "offset" },
    };
}
