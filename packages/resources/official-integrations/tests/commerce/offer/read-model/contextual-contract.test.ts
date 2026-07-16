import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

describe("commerce contextual offer read contract", () => {
    test("preserves the complete ordered page and current eleven-call budget", async () => {
        setRestResponder(request => contextualResponse(new URL(request.url)));

        const response = await requestCommerce(
            "/offers?category=rackets/tennis&q=blade&sort=price-desc&limit=2&offset=1",
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            items: [
                {
                    id: 91, inventoryRevision: 9, productId: 42, variantId: 51,
                    slug: "blade-91", title: "Blade 98", publicationStatus: "active",
                    acceptedPriceAmount: 15000, metadata: { publicNote: "Shown" },
                    product: {
                        id: 42, slug: "blade", title: "Blade", brandId: 4,
                        status: "active", visibility: "public",
                        metadata: { weight: 310, grip: "L2" },
                        brand: { id: 4, slug: "wilson", name: "Wilson", status: "active" },
                        primaryCategoryId: 8,
                        primaryCategory: {
                            id: 8, parentId: 2, slug: "tennis", fullSlug: "rackets/tennis",
                            label: "Tennis", status: "active", position: 3,
                        },
                        effectiveMetadata: { weight: 310, grip: "L2" },
                    },
                    variant: {
                        id: 51, productId: 42, sku: "BLADE-L2", title: "Grip L2",
                        status: "active", metadata: { weight: 310 },
                        effectiveMetadata: { weight: 310, grip: "L2" },
                    },
                    media: [
                        offerMedia(91, 501, 1, false, "front.jpg"),
                        offerMedia(91, 502, 2, true, "main.jpg"),
                    ],
                    mainImageMediaId: "502",
                },
                {
                    id: 92, inventoryRevision: 4, productId: 43, variantId: null,
                    slug: "speed-92", title: "Speed", publicationStatus: "active",
                    acceptedPriceAmount: 14000, metadata: {},
                    product: {
                        id: 43, slug: "speed", title: "Speed", brandId: null,
                        status: "active", visibility: "public", metadata: { weight: 290 },
                        brand: null, primaryCategoryId: null, primaryCategory: null,
                        effectiveMetadata: { weight: 290 },
                    },
                    variant: null, media: [], mainImageMediaId: null,
                },
            ],
            total: 2,
            limit: 2,
            offset: 1,
        });
        expect(expectRpc("search_public_offers").body).toEqual({
            p_category_full_slug: "rackets/tennis",
            p_filters: {},
            p_query: "blade",
            p_price_min: null,
            p_price_max: null,
            p_sort: "price-desc",
            p_limit: 2,
            p_offset: 1,
        });
        expect(capturedFetches().map(resourceName)).toEqual([
            "search_public_offers", "custom_field_definitions", "custom_field_definitions",
            "products", "product_variants", "offer_media", "brands", "product_categories",
            "product_variant_axes", "product_variant_axis_values", "product_variant_selections",
        ]);
    });
});

function contextualResponse(url: URL): Response {
    const resource = url.pathname.split("/").at(-1);
    if (resource === "search_public_offers") return jsonResponse({ items: offerRows(), total: 2 });
    if (resource === "custom_field_definitions") return jsonResponse(
        url.searchParams.get("entity_type") === "eq.offer"
            ? [{ key: "publicNote" }]
            : [{ key: "weight" }, { key: "grip" }],
    );
    if (resource === "products") return jsonResponse([
        { id: 42, slug: "blade", title: "Blade", brand_id: 4, status: "active", visibility: "public", metadata: { weight: 305, privateCost: 10 } },
        { id: 43, slug: "speed", title: "Speed", brand_id: null, status: "active", visibility: "public", metadata: { weight: 290, privateCost: 20 } },
    ]);
    if (resource === "product_variants") return jsonResponse([
        { id: 51, product_id: 42, sku: "BLADE-L2", title: "Grip L2", status: "active", metadata: { weight: 310, privateStock: 2 } },
    ]);
    if (resource === "offer_media") return jsonResponse([
        rawMedia(91, 501, 1, false, "front.jpg"), rawMedia(91, 502, 2, true, "main.jpg"),
    ]);
    if (resource === "brands") return jsonResponse([{ id: 4, slug: "wilson", name: "Wilson", status: "active" }]);
    if (resource === "product_categories") return jsonResponse([{
        product_id: 42, category_id: 8, is_primary: true, position: 3,
        category: { id: 8, parent_id: 2, slug: "tennis", full_slug: "rackets/tennis", label: "Tennis", status: "active", position: 3 },
    }]);
    if (resource === "product_variant_axes") return jsonResponse([{ id: 61, product_id: 42, field_key: "grip" }]);
    if (resource === "product_variant_axis_values") return jsonResponse([{ id: 71, product_id: 42, axis_id: 61, value: "L2" }]);
    if (resource === "product_variant_selections") return jsonResponse([{ product_id: 42, variant_id: 51, axis_id: 61, value_id: 71 }]);
    return jsonResponse([]);
}

function offerRows(): Record<string, unknown>[] {
    return [
        { id: 91, seller_id: 7, inventory_revision: 9, product_id: 42, variant_id: 51, slug: "blade-91", title: "Blade 98", publication_status: "active", accepted_price_amount: 15000, metadata: { publicNote: "Shown", moderationNote: "Hidden" } },
        { id: 92, seller_id: 8, inventory_revision: 4, product_id: 43, variant_id: null, slug: "speed-92", title: "Speed", publication_status: "active", accepted_price_amount: 14000, metadata: { moderationNote: "Hidden" } },
    ];
}

function rawMedia(offerId: number, mediaId: number, sortOrder: number, isMain: boolean, filename: string): Record<string, unknown> {
    return { id: mediaId + 1000, offer_id: offerId, media_id: mediaId, sort_order: sortOrder, is_main: isMain, media: {
        id: mediaId, storage_bucket: "commerce", storage_path: `offers/${filename}`,
        mime_type: "image/jpeg", file_size: mediaId, original_filename: filename,
        alt: null, created_at: "2026-07-01T10:00:00Z", updated_at: "2026-07-02T10:00:00Z",
    } };
}

function offerMedia(offerId: number, mediaId: number, sortOrder: number, isMain: boolean, filename: string): Record<string, unknown> {
    return {
        id: mediaId + 1000, offerId, mediaId, sortOrder, isMain,
        media: {
            id: mediaId, storageBucket: "commerce", storagePath: `offers/${filename}`,
            mimeType: "image/jpeg", fileSize: mediaId, originalFilename: filename,
            alt: null, createdAt: "2026-07-01T10:00:00Z",
            updatedAt: "2026-07-02T10:00:00Z", url: "",
        },
    };
}

function resourceName(call: { url: string }): string {
    return new URL(call.url).pathname.split("/").at(-1)!;
}
