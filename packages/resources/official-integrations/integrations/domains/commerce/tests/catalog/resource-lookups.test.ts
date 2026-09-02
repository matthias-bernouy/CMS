import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../tests/helpers/integrationDefinition";

type Endpoint = { endpointId: string; output?: Array<{ body?: DataShape }> };
type Definition = { artifacts: Array<{ source?: { endpoints: Endpoint[] } }> };

const definitionPath = resolve(import.meta.dir, "../../definition.json");

describe("commerce resource-backed lookup selections", () => {
    test("uses the six embedded relations and keeps direct endpoints available", async () => {
        const definition = await commerceDefinition();

        expect(lookupSelections(definition)).toEqual({
            brandId: "$resource.brand",
            primaryCategoryId: "$resource.primaryCategory",
            sellerId: "$resource.seller",
            productId: "$resource.product",
            variantId: "$resource.variant",
            parentId: "$resource.parent",
        });
        expect(endpoints(definition).map((endpoint) => endpoint.endpointId)).toEqual(
            expect.arrayContaining(["manageBrand", "manageCategory", "seller", "manageProduct", "productVariant"]),
        );
    });

    test("preserves relation labels and ids through strict source projection", async () => {
        const definition = await commerceDefinition();
        const sourceEndpoints = endpoints(definition);

        const product = projectStrictDataShape(
            {
                brandId: 7,
                brand: { id: 7, slug: "acme", name: "Acme", status: "active", privateNote: "hidden" },
                primaryCategoryId: 9,
                primaryCategory: {
                    id: 9,
                    parentId: 3,
                    slug: "shoes",
                    fullSlug: "fashion/shoes",
                    label: "Shoes",
                    status: "active",
                    position: 2,
                    privateNote: "hidden",
                },
                privateNote: "hidden",
            },
            responseBody(sourceEndpoints, "manageProduct"),
            "response",
            { enforceRequired: false },
        );
        const category = projectStrictDataShape(
            {
                parentId: 3,
                parent: {
                    id: 3,
                    slug: "fashion",
                    fullSlug: "fashion",
                    label: "Fashion",
                    status: "active",
                    privateNote: "hidden",
                },
                privateNote: "hidden",
            },
            responseBody(sourceEndpoints, "manageCategory"),
            "response",
            { enforceRequired: false },
        );

        expect(product).toEqual({
            brandId: 7,
            brand: { id: 7, slug: "acme", name: "Acme", status: "active" },
            primaryCategoryId: 9,
            primaryCategory: {
                id: 9,
                parentId: 3,
                slug: "shoes",
                fullSlug: "fashion/shoes",
                label: "Shoes",
                status: "active",
                position: 2,
            },
        });
        expect(category).toEqual({
            parentId: 3,
            parent: { id: 3, slug: "fashion", fullSlug: "fashion", label: "Fashion", status: "active" },
        });
    });
});

async function commerceDefinition(): Promise<Definition> {
    return loadIntegrationDefinition<Definition>(definitionPath);
}

function endpoints(definition: Definition): Endpoint[] {
    return definition.artifacts.find((artifact) => artifact.source)?.source?.endpoints ?? [];
}

function responseBody(sourceEndpoints: Endpoint[], endpointId: string): DataShape {
    const body = sourceEndpoints.find((endpoint) => endpoint.endpointId === endpointId)?.output?.[0]?.body;
    if (!body) {
        throw new Error(`Missing response contract for ${endpointId}`);
    }
    return body;
}

function lookupSelections(value: unknown, selections: Record<string, string> = {}): Record<string, string> {
    if (Array.isArray(value)) {
        for (const item of value) {
            lookupSelections(item, selections);
        }
        return selections;
    }
    if (!value || typeof value !== "object") {
        return selections;
    }
    const entry = value as Record<string, unknown>;
    const lookup = entry.lookup;
    if (typeof entry.id === "string" && lookup && typeof lookup === "object") {
        const selected = (lookup as Record<string, unknown>).selected;
        if (typeof selected === "string") {
            selections[entry.id] = selected;
        }
    }
    for (const child of Object.values(entry)) {
        lookupSelections(child, selections);
    }
    return selections;
}
