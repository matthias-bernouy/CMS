import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository } from "@bernouy/cms-sources";

describe("products-offers-link 1.0.0", () => {
    test("loads from the official integration catalog", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const list = await repo.list();
        const integration = await repo.get("products-offers-link");
        const serialized = JSON.stringify(integration);

        expect(list.map(entry => entry.kind)).toContain("products-offers-link");
        expect(integration?.kind).toBe("products-offers-link");
        expect(integration?.version).toBe("1.0.0");
        expect(serialized).toContain("\"type\":\"relation\"");
        expect(serialized).toContain("\"type\":\"dashboardRelation\"");
        expect(serialized).toContain("\"type\":\"sourceOverlay\"");
        expect(serialized).toContain("\"id\":\"product-offers\"");
        expect(serialized).toContain("{{dependencies.products.sourceId}}");
    });

    test("installs the product offers relation", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("products-offers-link");
        if (!definition) throw new Error("products-offers-link definition not found");

        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const relations = new InMemoryRelationRepository();
        const sourceOverlays = new InMemorySourceOverlayRepository();
        const dashboards = new InMemoryDashboardRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        await seedDependencySources(sources);
        await seedDependencyDashboards(dashboards);
        await seedDependencyInstallations(installations);

        const result = await importIntegration(
            { sources, secrets, relations, dashboards, sourceOverlays, installations },
            { kind: "products-offers-link", answers: {}, options: {} },
            [definition as IntegrationDefinition],
        );

        expect(result.artifacts).toEqual([
            { type: "sourceOverlay", id: "offers-product-lookup", action: "created" },
            { type: "relation", id: "product-offers", action: "created" },
            { type: "dashboardRelation", id: "products-products:productDetail:product-offers", action: "created" },
        ]);
        expect(await relations.getRelation("product-offers")).toMatchObject({
            id: "product-offers",
            from: { sourceId: "products", idPath: "id" },
            to: { sourceId: "offers", idPath: "id" },
            binding: {
                kind: "reference",
                endpoint: { sourceId: "offers", endpointId: "offers" },
                params: { productId: "$from.id" },
            },
            page: {
                itemsPath: "items",
                totalPath: "total",
                limitParam: "limit",
                offsetParam: "offset",
                defaultLimit: 25,
                maxLimit: 100,
            },
        });
        expect(await relations.getDashboardRelationProjection("products-products:productDetail:product-offers")).toMatchObject({
            relationId: "product-offers",
            dashboardId: "products-products",
            viewId: "productDetail",
            widget: "table",
            rowKey: "id",
            columns: expect.arrayContaining([
                expect.objectContaining({ id: "variantId", label: "Variant", path: "variantId" }),
            ]),
        });
        expect(await sourceOverlays.getOverlay("offers-product-lookup")).toMatchObject({
            sourceId: "offers",
            dashboardFields: [
                {
                    dashboardId: "offers-offers",
                    viewId: "offerDetail",
                    fieldId: "productId",
                    field: {
                        label: "Product",
                        type: "combobox",
                        lookup: {
                            sourceId: "products",
                            endpoint: "products",
                            selected: {
                                sourceId: "products",
                                endpoint: "product",
                            },
                        },
                    },
                },
                {
                    dashboardId: "offers-offers",
                    viewId: "offerDetail",
                    fieldId: "variantId",
                    field: {
                        label: "Variant",
                        type: "combobox",
                        lookup: {
                            sourceId: "products",
                            endpoint: "variants",
                            params: {
                                productId: "$field.productId",
                                q: "$search",
                                limit: "20",
                            },
                            selected: {
                                sourceId: "products",
                                endpoint: "variant",
                            },
                        },
                    },
                },
            ],
        });
    });
});

async function seedDependencySources(sources: InMemorySourceRepository): Promise<void> {
    await sources.createSource({
        urn: "urn:products",
        meta: { name: "Products" },
        endpoints: [{
            urn: "urn:products:products",
            method: "GET",
            access: { mode: "public" },
            targetUrl: "https://api.example.com/products",
        }],
    });
    await sources.createSource({
        urn: "urn:offers",
        meta: { name: "Offers" },
        endpoints: [{
            urn: "urn:offers:offers",
            method: "GET",
            access: { mode: "public" },
            targetUrl: "https://api.example.com/offers",
            input: {
                params: [
                    { name: "productId", in: "query", schema: { type: "string" } },
                    { name: "limit", in: "query", schema: { type: "number" } },
                    { name: "offset", in: "query", schema: { type: "number" } },
                ],
            },
        }],
    });
}

async function seedDependencyDashboards(dashboards: InMemoryDashboardRepository): Promise<void> {
    await dashboards.createDashboard({
        id: "products-products",
        source: "products",
        views: [{
            widget: "w-detail",
            id: "productDetail",
            source: { endpoint: "product", params: { id: "$selection.id" } },
            main: [{ id: "details", title: "Details", fields: [] }],
        }],
    });
}

async function seedDependencyInstallations(installations: InMemoryIntegrationInstallationRepository): Promise<void> {
    await installations.create({
        id: "products",
        label: "Products",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: "urn:products", action: "created" }],
        runs: [],
    });
    await installations.create({
        id: "offers",
        label: "Offers",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: "urn:offers", action: "created" }],
        runs: [],
    });
}
