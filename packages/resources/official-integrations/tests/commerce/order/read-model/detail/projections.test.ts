import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { buyerId, firstOrderPublicId, sellerUserId } from "../fixtures/raw";
import { useCompleteOrderResponder } from "../fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order detail read-model inputs", () => {
    test("uses one actor-scoped buyer read model", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce(`/me/order?publicId=${firstOrderPublicId}`, {
            userId: buyerId,
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("get_order_detail_read_model").body).toEqual({
            p_scope: "buyer", p_cms_user_id: buyerId,
            p_id: null, p_public_id: firstOrderPublicId,
        });
    });

    test("uses one actor-scoped seller read model", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("get_order_detail_read_model").body).toEqual({
            p_scope: "seller", p_cms_user_id: sellerUserId,
            p_id: 42, p_public_id: null,
        });
    });

    test("uses one administrator read model without inventing a role check", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/admin/order?id=42", { userRole: null });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("get_order_detail_read_model").body).toEqual({
            p_scope: "admin", p_cms_user_id: null,
            p_id: 42, p_public_id: null,
        });
    });
});
