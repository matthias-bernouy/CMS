import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../harness";
import { publicOfferDetailReadModel } from "./offer/publicReadModelFixtures";
installCommerceTestEnvironment();

describe("commerce offer requests", () => {
    test("includes only public product custom fields in public offer details", async () => {
        setRestResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/rpc/get_public_offer_read_model")) {
                return jsonResponse(publicOfferDetailReadModel());
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/offer?id=91");
        const offer = await response.json();

        expect(response.status).toBe(200);
        expect(offer).toEqual({
            id: 91,
            productId: 42,
            variantId: null,
            slug: "camera-offer",
            publicationStatus: "active",
            metadata: {},
            product: {
                id: 42,
                slug: "camera",
                title: "Camera",
                status: "active",
                visibility: "public",
                metadata: { brand: "Canon" },
                brand: null,
                primaryCategoryId: null,
                primaryCategory: null,
            },
            variant: null,
            priceRule: null,
            priceProposals: [],
            media: [
                {
                    id: 8,
                    mediaId: 12,
                    sortOrder: 0,
                    isMain: true,
                    media: {
                        id: 12,
                        storageBucket: "commerce-media",
                        storagePath: "offers/91/photo.jpg",
                        alt: "Front",
                        url: "",
                    },
                },
            ],
            mainImageMediaId: "12",
        });
        expect(expectSingleRpc("get_public_offer_read_model").body).toEqual({ p_offer_id: 91 });
    });

    test("hides an active offer whose seller is not verified when verification is required", async () => {
        setRestResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/rpc/get_public_offer_read_model")) {
                return jsonResponse({ candidate_exists: true, settings_available: true, offer: null });
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/offer?id=91");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "offer not found" });
        expect(expectSingleRpc("get_public_offer_read_model").body).toEqual({ p_offer_id: 91 });
    });

    test("rejects missing and invalid CMS bearer credentials before calling PostgREST", async () => {
        const missing = await requestCommerce("/health", { method: "GET", authenticated: false });
        const invalid = await requestCommerce("/health", {
            method: "GET",
            authorization: "Bearer wrong-key",
        });

        expect(missing.status).toBe(401);
        expect(await missing.json()).toEqual({ error: "invalid CMS API key" });
        expect(invalid.status).toBe(401);
        expect(await invalid.json()).toEqual({ error: "invalid CMS API key" });
    });

    test("derives the trusted seller identity from x-cms-user-id", async () => {
        const response = await requestCommerce("/me/offers", {
            userId: "seller-user-123",
            body: {
                slug: "seller-offer",
                productId: 42,
                sellerId: "spoofed-seller",
                sellerCmsUserId: "spoofed-user",
                cmsUserId: "spoofed-user",
            },
        });

        expect(response.status).toBe(200);
        const call = expectSingleRpc("create_my_offer");
        expect(call.body.p_cms_user_id).toBe("seller-user-123");
        expect(call.body).not.toHaveProperty("p_seller_id");
        expect(call.body).not.toHaveProperty("p_seller_cms_user_id");
        expect(Object.keys(call.body).sort()).toEqual(["p_cms_user_id", "p_payload"]);
        expect(call.body.p_payload).toEqual({ slug: "seller-offer", productId: 42 });
    });

    test("maps validation price errors to 422", async () => {
        setRestResponder(() =>
            jsonResponse(
                {
                    message: "validation: price must be between 11000 and 15000",
                },
                400,
            ),
        );

        const response = await requestCommerce("/me/offer/price?id=91", {
            userId: "seller-user-123",
            body: { amount: 12000, expectedVersion: 7, cmsUserId: "spoofed-user" },
        });

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: "price must be between 11000 and 15000" });
        expect(expectSingleRpc("submit_offer_price").body).toEqual({
            p_offer_id: 91,
            p_cms_user_id: "seller-user-123",
            p_amount: 12000,
            p_expected_version: 7,
        });
    });

    test("forwards seller inventory and pause changes without identity fields", async () => {
        const response = await requestCommerce("/me/offer?id=91", {
            userId: "seller-user-123",
            body: {
                expectedVersion: 8,
                publicationStatus: "paused",
                availability: "unavailable",
                quantityAvailable: 0,
                sellerId: "spoofed-seller",
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("update_my_offer").body).toEqual({
            p_offer_id: 91,
            p_cms_user_id: "seller-user-123",
            p_expected_version: 8,
            p_payload: {
                publicationStatus: "paused",
                availability: "unavailable",
                quantityAvailable: 0,
            },
        });
    });

    test("uses the trusted seller identity when reordering offer images", async () => {
        const response = await requestCommerce("/me/offer/images/reorder?offerId=91", {
            userId: "seller-user-123",
            body: { mediaIds: [12, 13], cmsUserId: "spoofed-user" },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("reorder_offer_media").body).toEqual({
            p_offer_id: 91,
            p_media_ids: [12, 13],
            p_cms_user_id: "seller-user-123",
        });
    });
});
