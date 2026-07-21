import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../harness";
import { publicOfferListReadModel } from "./publicReadModelFixtures";

installCommerceTestEnvironment();

describe("commerce public offer listing", () => {
    test("enriches cards and applies public price and sort filters", async () => {
        setRestResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/rpc/list_public_offers_read_model")) {
                return jsonResponse(publicOfferListReadModel());
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/offers?priceMax=200&sort=price-asc");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            items: [
                {
                    id: 1,
                    productId: 41,
                    variantId: 51,
                    slug: "blade",
                    title: "Blade",
                    publicationStatus: "active",
                    acceptedPriceAmount: 15000,
                    metadata: {},
                    product: {
                        id: 41,
                        title: "Blade",
                        metadata: { brand: "Wilson", sport: "tennis", weight: 305, grip: "L1" },
                        brand: null,
                        primaryCategoryId: 8,
                        primaryCategory: { id: 8, fullSlug: "rackets/tennis", label: "Tennis" },
                        effectiveMetadata: { brand: "Wilson", sport: "tennis", weight: 305, grip: "L1" },
                    },
                    variant: {
                        id: 51,
                        productId: 41,
                        title: "Grip: L1",
                        metadata: {},
                        effectiveMetadata: { brand: "Wilson", sport: "tennis", weight: 305, grip: "L1" },
                    },
                    media: [],
                    mainImageMediaId: null,
                },
                {
                    id: 2,
                    productId: 42,
                    slug: "speed",
                    title: "Speed",
                    publicationStatus: "active",
                    acceptedPriceAmount: 17500,
                    metadata: {},
                    product: {
                        id: 42,
                        title: "Speed",
                        metadata: { brand: "Head", sport: "tennis", grip: "L3", weight: 300 },
                        brand: null,
                        primaryCategoryId: null,
                        primaryCategory: null,
                        effectiveMetadata: { brand: "Head", sport: "tennis", grip: "L3", weight: 300 },
                    },
                    variant: null,
                    media: [],
                    mainImageMediaId: null,
                },
            ],
            total: 2,
            limit: 50,
            offset: 0,
        });
        expect(expectSingleRpc("list_public_offers_read_model").body).toEqual({
            p_price_max: 20000,
            p_sort: "price-asc",
            p_limit: 50,
            p_offset: 0,
        });
    });

    test("does not expose media belonging to an unpublished offer", async () => {
        setRestResponder((request) => {
            const table = new URL(request.url).pathname.split("/").at(-1);
            if (table === "offer_media") {
                return jsonResponse([{ offer_id: 91 }]);
            }
            if (table === "offers") {
                return jsonResponse([{ publication_status: "draft" }]);
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/offer/image?id=12");
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "offer image not found" });
    });

    test("allows pending sellers in public listings when verification is optional", async () => {
        setRestResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/rpc/list_public_offers_read_model")) {
                return jsonResponse({ settings_available: true, items: [], total: 0 });
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/offers");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        expect(expectSingleRpc("list_public_offers_read_model").body).toEqual({
            p_limit: 50,
            p_offset: 0,
        });
    });

    test("preserves an unrecognized padded sort as the default ordering", async () => {
        setRestResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/rpc/list_public_offers_read_model")) {
                return jsonResponse({ settings_available: true, items: [], total: 0 });
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/offers?sort=%20price-asc%20");

        expect(response.status).toBe(200);
        expect(expectSingleRpc("list_public_offers_read_model").body).toEqual({
            p_sort: " price-asc ",
            p_limit: 50,
            p_offset: 0,
        });
    });
});
