import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../../../tests/helpers/integrationDefinition";
import { capturedFetches, expectSingleRpc, installCommerceTestEnvironment, requestCommerce } from "../../../harness";

installCommerceTestEnvironment();

describe("commerce stable refund amount forms", () => {
    test("keeps the legacy order-refund binding", async () => {
        const response = await requestCommerce("/admin/order/refund", {
            userId: "admin-legacy",
            userRole: "admin",
            body: { orderId: 42, reason: "legacy review", amount: 8_000 },
        });

        expect(response.status).toBe(201);
        expect(expectSingleRpc("request_order_refund").body).toEqual({
            p_order_id: 42,
            p_reason: "legacy review",
            p_requested_amount: 8_000,
            p_actor_kind: "admin",
            p_actor_id: "admin-legacy",
        });
    });

    test("accepts the allocated order-refund binding", async () => {
        const response = await requestCommerce("/admin/order/refund", {
            userId: "admin-allocated",
            userRole: "admin",
            body: {
                orderId: 42,
                reason: "allocated review",
                merchandiseRefundAmount: 7_600,
                shippingRefundAmount: 0,
                protectionFeeRefundAmount: 400,
            },
        });

        expect(response.status).toBe(201);
        expect(expectSingleRpc("request_allocated_order_refund").body).toEqual({
            p_order_id: 42,
            p_reason: "allocated review",
            p_merchandise_refund_amount: 7_600,
            p_shipping_refund_amount: 0,
            p_protection_fee_refund_amount: 400,
            p_actor_kind: "admin",
            p_actor_id: "admin-allocated",
        });
    });

    test("keeps the legacy claim-resolution binding", async () => {
        const response = await requestCommerce("/admin/claim/resolve", {
            userId: "admin-legacy",
            userRole: "admin",
            body: {
                claimId: 7,
                outcome: "split",
                buyerRefundAmount: 4_000,
                sellerTransferAmount: 5_500,
                protectionFeeRefundAmount: 250,
                decisionReason: "legacy partial mismatch",
                expectedVersion: 3,
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("resolve_marketplace_claim").body).toEqual({
            p_claim_id: 7,
            p_outcome: "split",
            p_buyer_refund_amount: 4_000,
            p_seller_transfer_amount: 5_500,
            p_protection_fee_refund_amount: 250,
            p_decision_reason: "legacy partial mismatch",
            p_actor_kind: "admin",
            p_actor_id: "admin-legacy",
            p_expected_version: 3,
        });
    });

    test("accepts the allocated claim-resolution binding", async () => {
        const response = await requestCommerce("/admin/claim/resolve", {
            userId: "admin-allocated",
            userRole: "admin",
            body: {
                claimId: 7,
                outcome: "split",
                merchandiseRefundAmount: 3_750,
                shippingRefundAmount: 0,
                sellerTransferAmount: 5_500,
                protectionFeeRefundAmount: 250,
                decisionReason: "allocated partial mismatch",
                expectedVersion: 3,
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("resolve_allocated_marketplace_claim").body).toEqual({
            p_claim_id: 7,
            p_outcome: "split",
            p_merchandise_refund_amount: 3_750,
            p_shipping_refund_amount: 0,
            p_seller_transfer_amount: 5_500,
            p_protection_fee_refund_amount: 250,
            p_decision_reason: "allocated partial mismatch",
            p_actor_kind: "admin",
            p_actor_id: "admin-allocated",
            p_expected_version: 3,
        });
    });

    test("rejects missing, mixed, and partial amount forms before RPC execution", async () => {
        const cases = [
            requestCommerce("/admin/order/refund", {
                userId: "admin-7",
                userRole: "admin",
                body: { orderId: 42, reason: "missing" },
            }),
            requestCommerce("/admin/order/refund", {
                userId: "admin-7",
                userRole: "admin",
                body: {
                    orderId: 42,
                    reason: "mixed",
                    amount: 8_000,
                    merchandiseRefundAmount: 7_600,
                    shippingRefundAmount: 0,
                    protectionFeeRefundAmount: 400,
                },
            }),
            requestCommerce("/admin/claim/resolve", {
                userId: "admin-7",
                userRole: "admin",
                body: {
                    claimId: 7,
                    outcome: "buyer",
                    merchandiseRefundAmount: 7_600,
                    sellerTransferAmount: 0,
                    protectionFeeRefundAmount: 400,
                    decisionReason: "partial",
                    expectedVersion: 3,
                },
            }),
            requestCommerce("/admin/claim/resolve", {
                userId: "admin-7",
                userRole: "admin",
                body: {
                    claimId: 7,
                    outcome: "buyer",
                    buyerRefundAmount: 8_000,
                    merchandiseRefundAmount: 7_600,
                    shippingRefundAmount: 0,
                    sellerTransferAmount: 0,
                    protectionFeeRefundAmount: 400,
                    decisionReason: "mixed",
                    expectedVersion: 3,
                },
            }),
        ];
        const responses = await Promise.all(cases);

        expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
        expect(capturedFetches()).toHaveLength(0);
    });

    test("publishes both amount forms additively without requiring either branch", async () => {
        const endpoints = await sourceEndpoints();
        const refund = endpoints.find((endpoint) => endpoint.endpointId === "requestOrderRefund");
        const claim = endpoints.find((endpoint) => endpoint.endpointId === "resolveOrderClaim");

        expect(refund?.body?.properties).toEqual(
            expect.objectContaining({
                amount: expect.any(Object),
                merchandiseRefundAmount: expect.any(Object),
                shippingRefundAmount: expect.any(Object),
                protectionFeeRefundAmount: expect.any(Object),
            }),
        );
        expect(refund?.body?.required).toEqual(["orderId", "reason"]);
        expect(claim?.body?.properties).toEqual(
            expect.objectContaining({
                buyerRefundAmount: expect.any(Object),
                merchandiseRefundAmount: expect.any(Object),
                shippingRefundAmount: expect.any(Object),
            }),
        );
        expect(claim?.body?.required).toEqual([
            "claimId",
            "outcome",
            "sellerTransferAmount",
            "protectionFeeRefundAmount",
            "decisionReason",
            "expectedVersion",
        ]);
    });
});

async function sourceEndpoints(): Promise<any[]> {
    const definition = await loadIntegrationDefinition<any>(resolve(import.meta.dir, "../../../../definition.json"));
    return definition.artifacts.find((artifact: any) => artifact.source)?.source?.endpoints ?? [];
}
