import { describe, expect, test } from "bun:test";
import { capturedFetches, expectRpc, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import { expectedAdminList, expectedBuyerList, expectedSellerList } from "./fixtures/expected-lists";
import { buyerId, sellerUserId } from "./fixtures/raw";
import { callsFor, useCompleteOrderResponder } from "./fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order and sale list read contracts", () => {
    test("preserves the exact buyer page, ordering, ownership, metadata, and operation projection", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/orders?limit=2&offset=2", { userId: buyerId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedBuyerList);
        expect(expectRpc("list_order_read_model").body).toEqual({
            p_scope: "buyer",
            p_cms_user_id: buyerId,
            p_status: null,
            p_seller_id: null,
            p_limit: 2,
            p_offset: 2,
        });
    });

    test("preserves the exact seller page and omits buyer-owned and internal fields", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/sales?limit=2&offset=2", { userId: sellerUserId });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(expectedSellerList);
        expect(expectRpc("list_order_read_model").body).toEqual({
            p_scope: "seller",
            p_cms_user_id: sellerUserId,
            p_status: null,
            p_seller_id: null,
            p_limit: 2,
            p_offset: 2,
        });
        expect(JSON.stringify(body)).not.toContain(buyerId);
        expect(JSON.stringify(body)).not.toContain("checkout-key-42");
        expect(JSON.stringify(body)).not.toContain("internalRisk");
    });

    test("preserves the exact administrator page and raw metadata", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/admin/orders?limit=2&offset=2");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedAdminList);
        expect(expectRpc("list_order_read_model").body).toEqual({
            p_scope: "admin",
            p_cms_user_id: null,
            p_status: null,
            p_seller_id: null,
            p_limit: 2,
            p_offset: 2,
        });
        expect(capturedFetches()).toHaveLength(1);
    });

    test("preserves status filters, actor scoping, and pagination bounds", async () => {
        useCompleteOrderResponder();

        const buyer = await requestCommerce("/me/orders?status=%20active%20&sellerId=99&limit=0&offset=-3", {
            userId: buyerId,
        });
        expect(await buyer.json()).toMatchObject({ limit: 1, offset: 0 });
        expect(callsFor("list_order_read_model").at(-1)!.body).toEqual({
            p_scope: "buyer",
            p_cms_user_id: buyerId,
            p_status: "active",
            p_seller_id: null,
            p_limit: 1,
            p_offset: 0,
        });

        const seller = await requestCommerce("/me/sales?status=%20active%20&limit=101&offset=-2", {
            userId: sellerUserId,
        });
        expect(await seller.json()).toMatchObject({ limit: 100, offset: 0 });
        expect(callsFor("list_order_read_model").at(-1)!.body).toEqual({
            p_scope: "seller",
            p_cms_user_id: sellerUserId,
            p_status: "active",
            p_seller_id: null,
            p_limit: 100,
            p_offset: 0,
        });

        const admin = await requestCommerce("/admin/orders?status=%20active%20&sellerId=17&limit=101&offset=-1");
        expect(await admin.json()).toMatchObject({ limit: 100, offset: 0 });
        expect(callsFor("list_order_read_model").at(-1)!.body).toEqual({
            p_scope: "admin",
            p_cms_user_id: null,
            p_status: "active",
            p_seller_id: 17,
            p_limit: 100,
            p_offset: 0,
        });
        expect(callsFor("list_order_read_model")).toHaveLength(3);
    });
});
