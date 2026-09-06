import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../tests/helpers/integrationDefinition";

type Target = { endpointId: string; path?: string; editable?: string };
type Overlay = {
    id: string;
    fieldSource?: { endpointId: string; params?: Record<string, string> };
    input?: Target[];
    output?: Target[];
    fields?: Array<{ id: string; nullable?: boolean }>;
};
type Definition = { artifacts: Array<{ type: string; overlay?: Overlay }> };

const definitionPath = resolve(import.meta.dir, "../../definition.json");

describe("commerce custom-field overlays", () => {
    test("keeps Product admin metadata contextual while projecting public metadata", async () => {
        const definition = await loadIntegrationDefinition<Definition>(definitionPath);
        const overlays = definition.artifacts
            .filter((artifact) => artifact.type === "sourceOverlay")
            .map((artifact) => artifact.overlay!);
        const dynamicOverlays = overlays.filter((overlay) => overlay.fieldSource);
        const byEntity = Object.fromEntries(
            dynamicOverlays.map((overlay) => [overlay.fieldSource?.params?.entityType ?? "", overlay]),
        );

        expect(Object.keys(byEntity).sort()).toEqual(["offer", "order", "product", "seller"]);
        expect(byEntity.variant).toBeUndefined();
        expect(byEntity.product.input).toBeUndefined();
        expect(byEntity.product.output).toEqual(
            expect.arrayContaining([
                { endpointId: "product" },
                { endpointId: "products", path: "items[]" },
                { endpointId: "offer", path: "product" },
                { endpointId: "manageOffer", path: "product" },
            ]),
        );
        expect(byEntity.product.output).not.toEqual(
            expect.arrayContaining([{ endpointId: "manageProduct" }, { endpointId: "upsertProduct" }]),
        );
        expect(byEntity.offer.input).toEqual(
            expect.arrayContaining([
                { endpointId: "updateMyOffer", editable: "self" },
                { endpointId: "upsertOffer", editable: "admin" },
            ]),
        );
        expect(byEntity.seller.input).toEqual(
            expect.arrayContaining([
                { endpointId: "registerMySeller", editable: "self" },
                { endpointId: "updateMySeller", editable: "self" },
            ]),
        );
        expect(byEntity.order.input).toEqual(
            expect.arrayContaining([
                { endpointId: "checkoutMyCart", editable: "self" },
                { endpointId: "createOrder", editable: "self" },
            ]),
        );
        expect(byEntity.order.output).toEqual(
            expect.arrayContaining([
                { endpointId: "myOrder" },
                { endpointId: "myOrders", path: "items[]" },
                { endpointId: "mySale" },
                { endpointId: "mySales", path: "items[]" },
                { endpointId: "createOrder" },
                { endpointId: "checkoutMyCart", path: "orders[]" },
            ]),
        );
        expect(byEntity.order.output).not.toContainEqual({ endpointId: "createOrder", path: "orders[]" });
        expect(dynamicOverlays.every((overlay) => overlay.fieldSource?.endpointId === "entityCustomFields")).toBeTrue();
        const classification = overlays.find((overlay) => overlay.id === "commerce-product-classification");
        expect(classification?.fields).toEqual([
            expect.objectContaining({ id: "brandId", nullable: true }),
            expect.objectContaining({ id: "brandName", nullable: true }),
            expect.objectContaining({ id: "brandSlug", nullable: true }),
            expect.objectContaining({ id: "primaryCategoryId", nullable: true }),
            expect.objectContaining({ id: "primaryCategoryLabel", nullable: true }),
            expect.objectContaining({ id: "primaryCategoryFullSlug", nullable: true }),
        ]);
    });
});
