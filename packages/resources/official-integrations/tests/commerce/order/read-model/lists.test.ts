import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import {
    expectedAdminList,
    expectedBuyerList,
    expectedSellerList,
} from "./fixtures/expected-lists";
import { buyerId, sellerUserId } from "./fixtures/raw";
import { callsFor, useCompleteOrderResponder } from "./fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order and sale list read contracts", () => {
    test("preserves the exact buyer page, ordering, ownership, metadata, and operation projection", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/orders?limit=2&offset=2", { userId: buyerId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedBuyerList);
        const query = new URL(callsFor("orders")[0]!.url).searchParams;
        expect(query.get("buyer_cms_user_id")).toBe(`eq.${buyerId}`);
        expect(query.get("seller_id")).toBeNull();
        expect(query.get("order")).toBe("created_at.desc,id.desc");
        expect(query.get("limit")).toBe("2");
        expect(query.get("offset")).toBe("2");
        expect(callsFor("protected_order_operations")).toHaveLength(1);
        expect(callsFor("custom_field_definitions")).toHaveLength(1);
    });

    test("preserves the exact seller page and omits buyer-owned and internal fields", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/sales?limit=2&offset=2", { userId: sellerUserId });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(expectedSellerList);
        const sellerQuery = new URL(callsFor("sellers")[0]!.url).searchParams;
        const ordersQuery = new URL(callsFor("orders")[0]!.url).searchParams;
        expect(sellerQuery.get("cms_user_id")).toBe(`eq.${sellerUserId}`);
        expect(ordersQuery.get("seller_id")).toBe("eq.17");
        expect(ordersQuery.get("order")).toBe("created_at.desc,id.desc");
        expect(JSON.stringify(body)).not.toContain(buyerId);
        expect(JSON.stringify(body)).not.toContain("checkout-key-42");
        expect(JSON.stringify(body)).not.toContain("internalRisk");
    });

    test("preserves the exact administrator page and raw metadata", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/admin/orders?limit=2&offset=2");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedAdminList);
        const query = new URL(callsFor("orders")[0]!.url).searchParams;
        expect(query.get("buyer_cms_user_id")).toBeNull();
        expect(query.get("seller_id")).toBeNull();
        expect(query.get("order")).toBe("created_at.desc,id.desc");
        expect(callsFor("custom_field_definitions")).toHaveLength(0);
        expect(capturedFetches()).toHaveLength(2);
    });
});
