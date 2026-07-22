import { describe, expect, test } from "bun:test";
import {
    expectRpc,
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
installCommerceTestEnvironment();
describe("commerce seller sales", () => {
    test("lists only orders owned by the authenticated seller and strips buyer data", async () => {
        setRestResponder(async (request) => {
            const url = new URL(request.url);
            expect(url.pathname).toEndWith("/rpc/list_order_read_model");
            return jsonResponse({
                state: "ok",
                orders: [
                    saleRow({
                        buyer_cms_user_id: "buyer-must-not-leak",
                        shipping_address: { addressLine1: "private" },
                        billing_address: { addressLine1: "private" },
                        metadata: { private: true },
                        idempotency_key: "private-key",
                    }),
                ],
                operations: [],
                definitions: [],
                total: 5,
            });
        });

        const response = await requestCommerce("/me/sales?status=placed&limit=8&offset=2", {
            userId: "seller-user-17",
        });
        expect(response.status).toBe(200);
        const body = (await response.json()) as Record<string, any>;
        expect(body).toMatchObject({ total: 5, limit: 8, offset: 2 });
        expect(body.items[0]).toEqual({
            id: 42,
            publicId: "public-42",
            orderNumber: "CO-42",
            checkoutGroupId: "group-42",
            status: "placed",
            currency: "eur",
            subtotalAmount: 10000,
            shippingAmount: 450,
            deliveryQuotedAt: "2026-07-12T12:05:00.000Z",
            totalAmount: 10450,
            metadata: {},
            metadataEntries: [],
            version: 1,
            createdAt: "2026-07-12T12:00:00.000Z",
            updatedAt: "2026-07-12T12:05:00.000Z",
        });
        expect(JSON.stringify(body)).not.toContain("buyer-must-not-leak");
        expect(JSON.stringify(body)).not.toContain("private-key");
        expect(expectRpc("list_order_read_model").body).toEqual({
            p_scope: "seller",
            p_cms_user_id: "seller-user-17",
            p_status: "placed",
            p_seller_id: null,
            p_limit: 8,
            p_offset: 2,
        });
    });

    test("returns an empty page when the authenticated user has no seller profile", async () => {
        setRestResponder((request) => {
            expect(new URL(request.url).pathname).toEndWith("/rpc/list_order_read_model");
            return jsonResponse({
                state: "seller_missing",
                orders: [],
                operations: [],
                definitions: [],
                total: 0,
            });
        });

        const response = await requestCommerce("/me/sales?limit=6&offset=0", { userId: "not-a-seller" });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 6, offset: 0 });
        expect(expectRpc("list_order_read_model").body.p_cms_user_id).toBe("not-a-seller");
    });

    test("hides a sale not owned by the seller in one read-model call", async () => {
        setRestResponder((request) => {
            expect(new URL(request.url).pathname).toEndWith("/rpc/get_order_detail_read_model");
            return jsonResponse({ state: "not_found" });
        });

        const response = await requestCommerce("/me/sale?id=42", { userId: "another-seller" });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "sale not found" });
        expect(expectSingleRpc("get_order_detail_read_model").body).toEqual({
            p_scope: "seller",
            p_cms_user_id: "another-seller",
            p_id: 42,
            p_public_id: null,
        });
    });
});

function saleRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 42,
        public_id: "public-42",
        order_number: "CO-42",
        checkout_group_id: "group-42",
        seller_id: 17,
        status: "placed",
        currency: "eur",
        subtotal_amount: 10000,
        shipping_amount: 450,
        delivery_quoted_at: "2026-07-12T12:05:00.000Z",
        total_amount: 10450,
        version: 1,
        created_at: "2026-07-12T12:00:00.000Z",
        updated_at: "2026-07-12T12:05:00.000Z",
        ...extra,
    };
}
