import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";

installCommerceTestEnvironment();

describe("commerce contextual offer read contract", () => {
    test("preserves the complete ordered page with one read-model call", async () => {
        setRestResponder((request) => contextualResponse(new URL(request.url)));

        const response = await requestCommerce(
            "/offers?category=rackets/tennis&q=blade&sort=price-desc&limit=2&offset=1",
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            items: [
                {
                    id: 91,
                    inventoryRevision: 9,
                    productId: 42,
                    variantId: 51,
                    slug: "blade-91",
                    title: "Blade 98",
                    publicationStatus: "active",
                    acceptedPriceAmount: 15000,
                    metadata: { publicNote: "Shown" },
                    product: {
                        id: 42,
                        slug: "blade",
                        title: "Blade",
                        brandId: 4,
                        status: "active",
                        visibility: "public",
                        metadata: { weight: 310, grip: "L2" },
                        brand: { id: 4, slug: "wilson", name: "Wilson", status: "active" },
                        primaryCategoryId: 8,
                        primaryCategory: {
                            id: 8,
                            parentId: 2,
                            slug: "tennis",
                            fullSlug: "rackets/tennis",
                            label: "Tennis",
                            status: "active",
                            position: 3,
                        },
                        effectiveMetadata: { weight: 310, grip: "L2" },
                    },
                    variant: {
                        id: 51,
                        productId: 42,
                        sku: "BLADE-L2",
                        title: "Grip L2",
                        status: "active",
                        metadata: { weight: 310 },
                        effectiveMetadata: { weight: 310, grip: "L2" },
                    },
                    media: [offerMedia(91, 501, 1, false, "front.jpg"), offerMedia(91, 502, 2, true, "main.jpg")],
                    mainImageMediaId: "502",
                },
                {
                    id: 92,
                    inventoryRevision: 4,
                    productId: 43,
                    variantId: null,
                    slug: "speed-92",
                    title: "Speed",
                    publicationStatus: "active",
                    acceptedPriceAmount: 14000,
                    metadata: {},
                    product: {
                        id: 43,
                        slug: "speed",
                        title: "Speed",
                        brandId: null,
                        status: "active",
                        visibility: "public",
                        metadata: { weight: 290 },
                        brand: null,
                        primaryCategoryId: null,
                        primaryCategory: null,
                        effectiveMetadata: { weight: 290 },
                    },
                    variant: null,
                    media: [],
                    mainImageMediaId: null,
                },
            ],
            total: 2,
            limit: 2,
            offset: 1,
        });
        expect(expectRpc("search_public_offers_read_model").body).toEqual({
            p_category_full_slug: "rackets/tennis",
            p_filters: {},
            p_query: "blade",
            p_price_min: null,
            p_price_max: null,
            p_sort: "price-desc",
            p_limit: 2,
            p_offset: 1,
        });
        expect(capturedFetches().map(resourceName)).toEqual(["search_public_offers_read_model"]);
    });
});

function contextualResponse(url: URL): Response {
    const resource = url.pathname.split("/").at(-1);
    if (resource === "search_public_offers_read_model") {
        return jsonResponse({ items: readModelRows(), total: 2 });
    }
    return jsonResponse([]);
}

function readModelRows(): Record<string, unknown>[] {
    const [first, second] = offerRows();
    return [
        {
            ...withoutSeller(first!),
            metadata: { publicNote: "Shown" },
            product: {
                id: 42,
                slug: "blade",
                title: "Blade",
                brand_id: 4,
                status: "active",
                visibility: "public",
                metadata: { weight: 310, grip: "L2" },
                brand: { id: 4, slug: "wilson", name: "Wilson", status: "active" },
                primary_category_id: 8,
                primary_category: {
                    id: 8,
                    parent_id: 2,
                    slug: "tennis",
                    full_slug: "rackets/tennis",
                    label: "Tennis",
                    status: "active",
                    position: 3,
                },
                effective_metadata: { weight: 310, grip: "L2" },
            },
            variant: {
                id: 51,
                product_id: 42,
                sku: "BLADE-L2",
                title: "Grip L2",
                status: "active",
                metadata: { weight: 310 },
                effective_metadata: { weight: 310, grip: "L2" },
            },
            media: [
                withMediaUrl(rawMedia(91, 501, 1, false, "front.jpg")),
                withMediaUrl(rawMedia(91, 502, 2, true, "main.jpg")),
            ],
            main_image_media_id: "502",
        },
        {
            ...withoutSeller(second!),
            metadata: {},
            product: {
                id: 43,
                slug: "speed",
                title: "Speed",
                brand_id: null,
                status: "active",
                visibility: "public",
                metadata: { weight: 290 },
                brand: null,
                primary_category_id: null,
                primary_category: null,
                effective_metadata: { weight: 290 },
            },
            variant: null,
            media: [],
            main_image_media_id: null,
        },
    ];
}

function offerRows(): Record<string, unknown>[] {
    return [
        {
            id: 91,
            seller_id: 7,
            inventory_revision: 9,
            product_id: 42,
            variant_id: 51,
            slug: "blade-91",
            title: "Blade 98",
            publication_status: "active",
            accepted_price_amount: 15000,
            metadata: { publicNote: "Shown", moderationNote: "Hidden" },
        },
        {
            id: 92,
            seller_id: 8,
            inventory_revision: 4,
            product_id: 43,
            variant_id: null,
            slug: "speed-92",
            title: "Speed",
            publication_status: "active",
            accepted_price_amount: 14000,
            metadata: { moderationNote: "Hidden" },
        },
    ];
}

function rawMedia(
    offerId: number,
    mediaId: number,
    sortOrder: number,
    isMain: boolean,
    filename: string,
): Record<string, unknown> {
    return {
        id: mediaId + 1000,
        offer_id: offerId,
        media_id: mediaId,
        sort_order: sortOrder,
        is_main: isMain,
        media: {
            id: mediaId,
            storage_bucket: "commerce",
            storage_path: `offers/${filename}`,
            mime_type: "image/jpeg",
            file_size: mediaId,
            original_filename: filename,
            alt: null,
            created_at: "2026-07-01T10:00:00Z",
            updated_at: "2026-07-02T10:00:00Z",
        },
    };
}

function withMediaUrl(row: Record<string, unknown>): Record<string, unknown> {
    return { ...row, media: { ...(row.media as Record<string, unknown>), url: "" } };
}

function withoutSeller(row: Record<string, unknown>): Record<string, unknown> {
    const { seller_id: _sellerId, ...offer } = row;
    return offer;
}

function offerMedia(
    offerId: number,
    mediaId: number,
    sortOrder: number,
    isMain: boolean,
    filename: string,
): Record<string, unknown> {
    return {
        id: mediaId + 1000,
        offerId,
        mediaId,
        sortOrder,
        isMain,
        media: {
            id: mediaId,
            storageBucket: "commerce",
            storagePath: `offers/${filename}`,
            mimeType: "image/jpeg",
            fileSize: mediaId,
            originalFilename: filename,
            alt: null,
            createdAt: "2026-07-01T10:00:00Z",
            updatedAt: "2026-07-02T10:00:00Z",
            url: "",
        },
    };
}

function resourceName(call: { url: string }): string {
    return new URL(call.url).pathname.split("/").at(-1)!;
}
