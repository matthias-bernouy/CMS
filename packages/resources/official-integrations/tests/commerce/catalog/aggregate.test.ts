import { describe, expect, test } from "bun:test";
import {
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../harness";

installCommerceTestEnvironment();

describe("commerce product aggregate", () => {
    test("returns images, axes, and generated variants from one Product endpoint", async () => {
        setRestResponder(request => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/products")) return jsonResponse([{
                id: 42, slug: "racket", title: "Racket", status: "active",
                visibility: "public", metadata: { weight: 300, finish: "matte" }, version: 3,
            }]);
            if (path.endsWith("/product_variant_axes")) {
                return jsonResponse([{ id: 10, key: "grip", field_key: "grip", label: "Grip", position: 0 }]);
            }
            if (path.endsWith("/product_variant_axis_values")) {
                return jsonResponse([{ id: 11, axis_id: 10, key: "l1", label: "L1", value: "L1", position: 0 }]);
            }
            if (path.endsWith("/product_variants")) return jsonResponse([{
                id: 12, product_id: 42, sku: null, title: "Grip: L1", status: "active",
                position: 0, combination_key: "grip:l1", generated_from_axes: true,
                metadata: { finish: "glossy" }, version: 1,
            }]);
            if (path.endsWith("/product_variant_selections")) {
                return jsonResponse([{ variant_id: 12, axis_id: 10, value_id: 11 }]);
            }
            if (path.endsWith("/product_media")) return jsonResponse([{
                id: 14, media_id: 13, sort_order: 0, is_main: true,
                media: { id: 13, mime_type: "image/webp", alt: "Racket" },
            }]);
            return jsonResponse([]);
        });

        const response = await requestCommerce("/admin/product?id=42");
        const product = await response.json();

        expect(response.status).toBe(200);
        expect(product.variantAxes).toEqual([{
            key: "grip", fieldKey: "grip", label: "Grip", position: 0, values: ["L1"],
        }]);
        expect(product.variantMatrix).toEqual([expect.objectContaining({
            variantId: "12",
            key: "grip:l1",
            options: "L1",
            choices: [{
                axisKey: "grip", axisLabel: "Grip", valueKey: "l1", valueLabel: "L1",
                fieldKey: "grip", value: "L1",
            }],
            effectiveMetadata: { weight: 300, finish: "glossy", grip: "L1" },
        })]);
        expect(product.mainImageMediaId).toBe("13");
        expect(product.media[0]).toMatchObject({
            mediaId: 13,
            isMain: true,
            media: { id: 13, alt: "Racket", url: "" },
        });
    });
});
