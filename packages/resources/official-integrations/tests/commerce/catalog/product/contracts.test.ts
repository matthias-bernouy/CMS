import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../helpers/integrationDefinition";
import { installCommerceTestEnvironment, requestCommerce } from "../../harness";
import { adminProduct, adminSourceProduct, publicProduct, publicSourceProduct, variants } from "./expected";
import { useProductResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce product detail contracts", () => {
    test("preserves the complete administrator projection, nulls, metadata, and collection order", async () => {
        useProductResponder();

        const response = await requestCommerce("/admin/product?id=42", { userRole: null });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(adminProduct);
    });

    test("preserves the complete public projection and current metadata visibility", async () => {
        useProductResponder();

        const response = await requestCommerce("/product?slug=racket-pro");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(publicProduct);
    });

    test("preserves the historical inclusion of archived variants on the public detail", async () => {
        useProductResponder({
            variantRows: [{ ...variants[0]!, id: 102, status: "archived" }],
            selectionRows: [
                { variant_id: 102, axis_id: 11, value_id: 22 },
                { variant_id: 102, axis_id: 10, value_id: 20 },
            ],
        });

        const response = await requestCommerce("/product?id=42");
        const body = (await response.json()) as any;

        expect(response.status).toBe(200);
        expect(body.variants).toHaveLength(1);
        expect(body.variants[0]).toMatchObject({
            id: 102,
            status: "archived",
            metadata: { publicSpec: "variant", variantSecret: "kept" },
        });
    });

    test("uses the first ordered media item when no image is explicitly main", async () => {
        useProductResponder({ mainMedia: false });

        const response = await requestCommerce("/product?id=42");
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(body.mainImageMediaId).toBe("501");
        expect((body.media as Array<Record<string, unknown>>).map((item) => item.mediaId)).toEqual([501, 502]);
    });

    test("preserves absent optional relations as null and empty collections", async () => {
        useProductResponder({
            brandId: null,
            emptyRelations: true,
            product: {
                id: 43,
                slug: "empty-product",
                title: "Empty product",
                description: null,
                brand_id: null,
                status: "active",
                visibility: "public",
                metadata: null,
                version: 1,
                created_at: null,
                updated_at: null,
            },
        });

        const response = await requestCommerce("/admin/product?id=43");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            description: null,
            brandId: null,
            brand: null,
            metadata: null,
            media: [],
            mainImageMediaId: null,
            variantAxes: [],
            variants: [],
            variantMatrix: [],
        });
    });

    test("preserves the distinct strict Source projections consumed by integrations", async () => {
        const definition = await loadIntegrationDefinition<any>(definitionPath);
        const endpoints = definition.artifacts.find((artifact: any) => artifact.source).source.endpoints;

        expect(
            projectStrictDataShape(publicProduct, responseBody(endpoints, "product"), "response", {
                enforceRequired: false,
            }),
        ).toEqual(publicSourceProduct);
        expect(
            projectStrictDataShape(adminProduct, responseBody(endpoints, "manageProduct"), "response", {
                enforceRequired: false,
            }),
        ).toEqual(adminSourceProduct);
        expect(
            projectStrictDataShape(adminProduct, responseBody(endpoints, "upsertProduct"), "response", {
                enforceRequired: false,
            }),
        ).toEqual(adminSourceProduct);
    });
});

const definitionPath = resolve(
    import.meta.dir,
    "../../../../integrations/domains/commerce/versions/1.0.0/definition.json",
);

function responseBody(endpoints: any[], endpointId: string): DataShape {
    const body = endpoints.find((endpoint) => endpoint.endpointId === endpointId)?.output?.[0]?.body;
    if (!body) {
        throw new Error(`Missing response contract for ${endpointId}`);
    }
    return body;
}
