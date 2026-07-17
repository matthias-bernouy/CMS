import { describe, expect, test } from "bun:test";
import { expectRpc, installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";
installCommerceTestEnvironment();
describe("commerce seller sales", () => {
    test("lists only orders owned by the authenticated seller and strips buyer data", async () => {
        setRestResponder(async request => {
            const url = new URL(request.url);
            expect(url.pathname).toEndWith("/rpc/list_order_read_model");
            return jsonResponse({
                state: "ok",
                orders: [saleRow({
                    buyer_cms_user_id: "buyer-must-not-leak",
                    shipping_address: { addressLine1: "private" },
                    billing_address: { addressLine1: "private" },
                    metadata: { private: true },
                    idempotency_key: "private-key",
                })],
                operations: [],
                definitions: [],
                total: 5,
            });
        });

        const response = await requestCommerce("/me/sales?status=placed&limit=8&offset=2", { userId: "seller-user-17" });
        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, any>;
        expect(body).toMatchObject({ total: 5, limit: 8, offset: 2 });
        expect(body.items[0]).toEqual({ id: 42, publicId: "public-42", orderNumber: "CO-42", checkoutGroupId: "group-42",
            status: "placed", currency: "eur", subtotalAmount: 10000, shippingAmount: 450, deliveryQuotedAt: "2026-07-12T12:05:00.000Z",
            totalAmount: 10450, metadata: {}, metadataEntries: [], version: 1,
            createdAt: "2026-07-12T12:00:00.000Z", updatedAt: "2026-07-12T12:05:00.000Z" });
        expect(JSON.stringify(body)).not.toContain("buyer-must-not-leak");
        expect(JSON.stringify(body)).not.toContain("private-key");
        expect(expectRpc("list_order_read_model").body).toEqual({
            p_scope: "seller", p_cms_user_id: "seller-user-17", p_status: "placed",
            p_seller_id: null, p_limit: 8, p_offset: 2,
        });
    });

    test("returns an empty page when the authenticated user has no seller profile", async () => {
        setRestResponder(request => {
            expect(new URL(request.url).pathname).toEndWith("/rpc/list_order_read_model");
            return jsonResponse({
                state: "seller_missing", orders: [], operations: [], definitions: [], total: 0,
            });
        });

        const response = await requestCommerce("/me/sales?limit=6&offset=0", { userId: "not-a-seller" });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 6, offset: 0 });
        expect(expectRpc("list_order_read_model").body.p_cms_user_id).toBe("not-a-seller");
    });

    test("loads a seller-owned sale with safe lines and events", async () => {
        setRestResponder(request => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/sellers")) return jsonResponse([{ id: 17 }]);
            if (url.pathname.endsWith("/orders")) {
                expect(url.searchParams.get("id")).toBe("eq.42");
                expect(url.searchParams.get("seller_id")).toBe("eq.17");
                return jsonResponse([saleRow({ buyer_cms_user_id: "buyer-must-not-leak" })]);
            }
            if (url.pathname.endsWith("/order_lines")) {
                expect(url.searchParams.get("order_id")).toBe("eq.42");
                expect(url.searchParams.get("seller_id")).toBe("eq.17");
                return jsonResponse([{
                    id: 9,
                    order_id: 42,
                    offer_id: 3,
                    product_id: 4,
                    title: "Tennis racket",
                    quantity: 1,
                    unit_amount: 10000,
                    total_amount: 10000,
                    product_snapshot: { id: 4, slug: "racket", title: "Tennis racket" },
                    offer_snapshot: { id: 3, slug: "racket-3", title: "Tennis racket" },
                    created_at: "2026-07-12T12:00:00.000Z",
                    buyer_secret: "must-not-leak",
                }]);
            }
            if (url.pathname.endsWith("/order_events")) {
                return jsonResponse([{
                    id: 10,
                    order_id: 42,
                    event_type: "created",
                    actor_kind: "buyer",
                    actor_id: "buyer-must-not-leak",
                    message: "private message",
                    data: { private: true },
                    created_at: "2026-07-12T12:00:00.000Z",
                }]);
            }
            if (url.pathname.endsWith("/protected_order_operations")) return jsonResponse([{ order_id: 42, payment_status: "succeeded", buyer_cms_user_id: "buyer-must-not-leak" }]);
            if (url.pathname.endsWith("/order_financial_terms")) {
                const select = url.searchParams.get("select") || "";
                expect(select).toContain("seller_commission_amount");
                expect(select).toContain("platform_shipping_share_amount");
                expect(select).toContain("seller_shipping_share_amount");
                expect(select).not.toContain("buyer_total_amount");
                expect(select).not.toContain("buyer_protection_fee_amount");
                return jsonResponse([{
                    order_id: 42,
                    merchandise_subtotal_amount: 10000,
                    shipping_amount: 450,
                    seller_commission_amount: 1000,
                    platform_shipping_share_amount: 450,
                    seller_shipping_share_amount: 0,
                    seller_proceeds_amount: 9000,
                    seller_transfer_release_amount: 8500,
                    seller_reserve_liability_amount: 500,
                    currency: "eur",
                    pricing_locked_at: "2026-07-12T12:01:00.000Z",
                    pay_by_at: "2026-07-12T12:31:00.000Z",
                    financial_revision: 1,
                    buyer_total_amount: 11000,
                }]);
            }
            if (url.pathname.endsWith("/order_fulfillments")) return jsonResponse([{ order_id: 42, status: "in_transit" }]);
            if (url.pathname.endsWith("/order_settlements")) return jsonResponse([{ order_id: 42, status: "held", authorized_seller_amount: 9000 }]);
            if (url.pathname.endsWith("/custom_field_definitions")) return jsonResponse([]);
            if (url.pathname.endsWith("/rpc/get_order_fulfillment_authorization")) return jsonResponse({ allowed: false, reason: "in_transit", buyer_cms_user_id: "buyer-must-not-leak" });
            throw new Error(`Unexpected request ${request.url}`);
        });
        const response = await requestCommerce("/me/sale?id=42", { userId: "seller-user-17" });
        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, any>;
        expect(body.id).toBe(42);
        expect(body.lines).toEqual([expect.objectContaining({ id: 9, orderId: 42, offerId: 3, title: "Tennis racket" })]);
        expect(body.events).toEqual([{ id: 10, orderId: 42, eventType: "created",
            createdAt: "2026-07-12T12:00:00.000Z" }]);
        expect(body.financialTerms).toEqual({
            orderId: 42,
            merchandiseSubtotalAmount: 10000,
            shippingAmount: 450,
            sellerCommissionAmount: 1000,
            platformShippingShareAmount: 450,
            sellerShippingShareAmount: 0,
            sellerProceedsAmount: 9000,
            sellerTransferReleaseAmount: 8500,
            sellerReserveLiabilityAmount: 500,
            currency: "eur",
            pricingLockedAt: "2026-07-12T12:01:00.000Z",
            payByAt: "2026-07-12T12:31:00.000Z",
            financialRevision: 1,
        });
        expect(body.financialTerms).not.toHaveProperty("buyerTotalAmount");
        expect(JSON.stringify(body)).not.toContain("buyer-must-not-leak");
        expect(JSON.stringify(body)).not.toContain("private message");
        expect(JSON.stringify(body)).not.toContain("buyer_secret");
    });

    test("does not query sale details when the order is not owned by the seller", async () => {
        let detailQueryReached = false;
        setRestResponder(request => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/sellers")) return jsonResponse([{ id: 99 }]);
            if (url.pathname.endsWith("/orders")) {
                expect(url.searchParams.get("id")).toBe("eq.42");
                expect(url.searchParams.get("seller_id")).toBe("eq.99");
                return jsonResponse([]);
            }
            detailQueryReached = true;
            return jsonResponse([]);
        });

        const response = await requestCommerce("/me/sale?id=42", { userId: "another-seller" });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "sale not found" });
        expect(detailQueryReached).toBe(false);
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
