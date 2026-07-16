import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";

installCommerceTestEnvironment();

describe("commerce public offer listing", () => {
    test("enriches cards and applies public price and sort filters", async () => {
        let offersQuery = "";
        let productQueries = 0;
        setRestResponder(request => {
            const url = new URL(request.url);
            const table = url.pathname.split("/").at(-1);
            if (table === "settings") return jsonResponse([{ require_verified_seller: true }]);
            if (table === "offers") {
                offersQuery = url.search;
                return jsonResponse([
                    { id: 1, seller_id: 7, product_id: 41, variant_id: 51, slug: "blade", title: "Blade", publication_status: "active", accepted_price_amount: 15000, metadata: {} },
                    { id: 2, seller_id: 8, product_id: 42, slug: "speed", title: "Speed", publication_status: "active", accepted_price_amount: 17500, metadata: {} },
                ], 200, { "content-range": "0-1/2" });
            }
            if (table === "custom_field_definitions") {
                return jsonResponse(url.searchParams.get("entity_type") === "eq.product"
                    ? ["brand", "sport", "grip", "weight"].map(key => ({ key })) : []);
            }
            if (table === "products") {
                productQueries += 1;
                expect(url.searchParams.get("id")).toBe("in.(41,42)");
                return jsonResponse([
                    { id: 41, title: "Blade", metadata: { brand: "Wilson", sport: "tennis", weight: 305 } },
                    { id: 42, title: "Speed", metadata: { brand: "Head", sport: "tennis", grip: "L3", weight: 300 } },
                ]);
            }
            if (table === "product_variants") return jsonResponse([
                { id: 51, product_id: 41, title: "Grip: L1", metadata: {} },
            ]);
            if (table === "product_categories") return jsonResponse([{
                product_id: 41,
                category_id: 8,
                is_primary: true,
                category: { id: 8, full_slug: "rackets/tennis", label: "Tennis" },
            }]);
            if (table === "product_variant_axes") return jsonResponse([
                { id: 61, product_id: 41, field_key: "grip" },
            ]);
            if (table === "product_variant_axis_values") return jsonResponse([
                { id: 71, product_id: 41, axis_id: 61, value: "L1" },
            ]);
            if (table === "product_variant_selections") return jsonResponse([
                { product_id: 41, variant_id: 51, axis_id: 61, value_id: 71 },
            ]);
            if (table === "sellers") return jsonResponse([
                { id: 7, display_name: "Seller one" },
                { id: 8, display_name: "Seller two" },
            ]);
            return jsonResponse([]);
        });

        const response = await requestCommerce("/offers?priceMax=200&sort=price-asc");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.total).toBe(2);
        expect(body.items[0]).toMatchObject({
            slug: "blade",
            product: { primaryCategoryId: 8, metadata: { brand: "Wilson", weight: 305, grip: "L1" } },
            variant: { effectiveMetadata: { brand: "Wilson", weight: 305, grip: "L1" } },
        });
        expect(body.items[1]).toMatchObject({ slug: "speed", product: { metadata: { brand: "Head" } } });
        expect(productQueries).toBe(1);
        expect(offersQuery).toContain("accepted_price_amount=lte.20000");
        expect(offersQuery).toContain("order=accepted_price_amount.asc.nullslast");
        expect(offersQuery).toContain("availability=eq.available");
        expect(offersQuery).toContain("seller.verification_status=eq.verified");
        expect(offersQuery).toContain("seller%3Asellers%21inner%28verification_status%29");
    });

    test("does not expose media belonging to an unpublished offer", async () => {
        setRestResponder(request => {
            const table = new URL(request.url).pathname.split("/").at(-1);
            if (table === "offer_media") return jsonResponse([{ offer_id: 91 }]);
            if (table === "offers") return jsonResponse([{ publication_status: "draft" }]);
            return jsonResponse([]);
        });

        const response = await requestCommerce("/offer/image?id=12");
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "offer image not found" });
    });

    test("allows pending sellers in public listings when verification is optional", async () => {
        let offersQuery = "";
        setRestResponder(request => {
            const url = new URL(request.url);
            const table = url.pathname.split("/").at(-1);
            if (table === "settings") return jsonResponse([{ require_verified_seller: false }]);
            if (table === "offers") {
                offersQuery = url.search;
                return jsonResponse([], 200, { "content-range": "0-0/0" });
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/offers");

        expect(response.status).toBe(200);
        expect(offersQuery).toContain("availability=eq.available");
        expect(offersQuery).toContain("seller.verification_status=in.%28pending%2Cverified%29");
    });
});
