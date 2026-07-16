import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../harness";

installCommerceTestEnvironment();

const userId = "buyer-user-123";

describe("commerce cart routes", () => {
    test("gets the cart for the trusted CMS user", async () => {
        const response = await requestCommerce("/me/cart", { userId });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("get_cart").body).toEqual({
            p_buyer_cms_user_id: userId,
        });
    });

    test("maps item upserts and ignores untrusted ownership and price fields", async () => {
        const response = await requestCommerce("/me/cart/item", {
            userId,
            body: {
                offerId: 91,
                quantity: 2,
                expectedVersion: 4,
                buyerCmsUserId: "spoofed-buyer",
                cmsUserId: "spoofed-user",
                unitAmount: 1,
                currency: "usd",
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("upsert_cart_item").body).toEqual({
            p_buyer_cms_user_id: userId,
            p_offer_id: 91,
            p_quantity: 2,
            p_expected_version: 4,
        });
    });

    test("allows the first item upsert without an expected version", async () => {
        const response = await requestCommerce("/me/cart/item", {
            userId,
            body: { offerId: 91, quantity: 1 },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("upsert_cart_item").body).toEqual({
            p_buyer_cms_user_id: userId,
            p_offer_id: 91,
            p_quantity: 1,
        });
    });

    test("maps item removal from query parameters", async () => {
        const response = await requestCommerce(
            "/me/cart/item?offerId=91&expectedVersion=5&buyerCmsUserId=spoofed",
            { method: "DELETE", userId },
        );

        expect(response.status).toBe(200);
        expect(expectSingleRpc("remove_cart_item").body).toEqual({
            p_buyer_cms_user_id: userId,
            p_offer_id: 91,
            p_expected_version: 5,
        });
    });

    test("maps cart clearing and ignores a body owner", async () => {
        const response = await requestCommerce("/me/cart/clear", {
            userId,
            body: { expectedVersion: 6, buyerCmsUserId: "spoofed-buyer" },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("clear_cart").body).toEqual({
            p_buyer_cms_user_id: userId,
            p_expected_version: 6,
        });
    });

    test("rejects missing ownership and malformed mutation inputs", async () => {
        const missingOwner = await requestCommerce("/me/cart");
        const missingOffer = await requestCommerce("/me/cart/item", {
            userId,
            body: { quantity: 1 },
        });
        const invalidQuantity = await requestCommerce("/me/cart/item", {
            userId,
            body: { offerId: 91, quantity: "1.5" },
        });
        const missingRemoveVersion = await requestCommerce("/me/cart/item?offerId=91", {
            method: "DELETE",
            userId,
        });
        const missingClearVersion = await requestCommerce("/me/cart/clear", {
            userId,
            body: {},
        });

        expect(await missingOwner.json()).toEqual({ error: "missing CMS user id" });
        expect(await missingOffer.json()).toEqual({ error: "offerId is required" });
        expect(await invalidQuantity.json()).toEqual({ error: "quantity must be an integer" });
        expect(await missingRemoveVersion.json()).toEqual({ error: "expectedVersion is required" });
        expect(await missingClearVersion.json()).toEqual({ error: "expectedVersion is required" });
    });
});
