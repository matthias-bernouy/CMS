import { describe, expect, test } from "bun:test";
import {
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

describe("commerce contextual offer listing", () => {
    test("validates contextual filters in PostgreSQL before enriching the page", async () => {
        setRestResponder((request) => {
            const url = new URL(request.url);
            const table = url.pathname.split("/").at(-1);
            if (table === "search_public_offers_read_model") {
                return jsonResponse({
                    whole_unit_prices: false,
                    items: [
                        {
                            id: 91,
                            product_id: 42,
                            slug: "blade",
                            title: "Blade",
                            publication_status: "active",
                            metadata: {},
                            product: {
                                id: 42,
                                brand: { slug: "wilson" },
                                primary_category_id: 8,
                                primary_category: { full_slug: "rackets/tennis" },
                            },
                            variant: null,
                            media: [],
                            main_image_media_id: null,
                        },
                    ],
                    total: 1,
                    limit: 12,
                    offset: 0,
                });
            }
            if (table === "custom_field_definitions") {
                return jsonResponse([]);
            }
            if (table === "sellers") {
                return jsonResponse([{ id: 7, display_name: "Seller" }]);
            }
            if (table === "products") {
                return jsonResponse([{ id: 42, brand_id: 4, title: "Blade", metadata: { weight: 305 } }]);
            }
            if (table === "brands") {
                return jsonResponse([{ id: 4, slug: "wilson", name: "Wilson" }]);
            }
            if (table === "product_categories") {
                return jsonResponse([
                    {
                        product_id: 42,
                        category_id: 8,
                        is_primary: true,
                        category: { id: 8, full_slug: "rackets/tennis", label: "Tennis" },
                    },
                ]);
            }
            return jsonResponse([]);
        });
        const filters = encodeURIComponent(JSON.stringify({ weight: { gte: 300, lte: 320 } }));
        const response = await requestCommerce(
            `/offers?category=rackets/tennis&brand=wilson&filters=${filters}&limit=12`,
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(expectRpc("search_public_offers_read_model").body).toMatchObject({
            p_category_full_slug: "rackets/tennis",
            p_brand_slug: "wilson",
            p_filters: { weight: { gte: 300, lte: 320 } },
            p_limit: 12,
            p_offset: 0,
        });
        expect(body).toMatchObject({
            wholeUnitPrices: false,
            total: 1,
            items: [
                {
                    product: {
                        brand: { slug: "wilson" },
                        primaryCategoryId: 8,
                        primaryCategory: { fullSlug: "rackets/tennis" },
                    },
                },
            ],
        });
    });

    test("ignores empty filter placeholders emitted by optional controls", async () => {
        setRestResponder((request) => {
            const table = new URL(request.url).pathname.split("/").at(-1);
            if (table === "search_public_offers_read_model") {
                return jsonResponse({ items: [], whole_unit_prices: false, total: 0 });
            }
            return jsonResponse([]);
        });
        const filters = encodeURIComponent(JSON.stringify({ weight: { gte: "", lte: "320" }, grip: { eq: "" } }));
        const response = await requestCommerce(`/offers?category=rackets/tennis&filters=${filters}`);

        expect(response.status).toBe(200);
        expect(expectRpc("search_public_offers_read_model").body.p_filters).toEqual({ weight: { lte: "320" } });
    });

    test("normalizes entirely empty optional filters before calling PostgreSQL", async () => {
        setRestResponder((request) => {
            const table = new URL(request.url).pathname.split("/").at(-1);
            if (table === "search_public_offers_read_model") {
                return jsonResponse({ items: [], whole_unit_prices: false, total: 0 });
            }
            return jsonResponse([]);
        });
        const filters = encodeURIComponent(JSON.stringify({ weight: { gte: "", lte: "" }, grip: { eq: "" } }));
        const response = await requestCommerce(
            `/offers?category=&brand=&conditionCode=&sort=&priceMin=&priceMax=&filters=${filters}`,
        );

        expect(response.status).toBe(200);
        expect(expectRpc("search_public_offers_read_model").body).toMatchObject({
            p_filters: {},
            p_price_min: null,
            p_price_max: null,
        });
        expect(expectRpc("search_public_offers_read_model").body.p_category_full_slug).toBeUndefined();
        expect(expectRpc("search_public_offers_read_model").body.p_brand_slug).toBeUndefined();
    });

    test("fails closed when contextual price precision is missing", async () => {
        setRestResponder((request) => {
            const table = new URL(request.url).pathname.split("/").at(-1);
            return table === "search_public_offers_read_model"
                ? jsonResponse({ items: [], total: 0 })
                : jsonResponse([]);
        });

        const response = await requestCommerce("/offers?category=rackets/tennis");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: "search_public_offers returned an invalid response",
        });
    });
});
