import { describe, expect, test } from "bun:test";
import {
    clearProviderRequests,
    newerAt,
    olderAt,
    postgrestBody,
    postgrestTables,
    refreshedAt,
    responseBody,
    type CreateDashboardReadHarness,
    type JsonRecord,
} from "../dashboard-contract-harness";

export function registerRefundDashboardContracts(createHarness: CreateDashboardReadHarness): void {
    describe("stripe-connect refund dashboard read contracts", () => {
        test("keeps exact list/detail payloads with one PostgREST list read", async () => {
            const harness = await createHarness();
            const firstPaymentId = harness.rest.seedDashboardPayment("order-refund-new");
            const secondPaymentId = harness.rest.seedDashboardPayment("order-refund-old");
            const first = harness.rest.seedDashboardRow(
                "refunds",
                refundRow(firstPaymentId, "refund-new", newerAt, { commerce_refund_request_id: null }),
            );
            const second = harness.rest.seedDashboardRow(
                "refunds",
                refundRow(secondPaymentId, "refund-old", olderAt, { stripe_refund_id: null, status: "pending" }),
            );
            const thirdPaymentId = harness.rest.seedDashboardPayment("order-refund-outside-page");
            harness.rest.seedDashboardRow("refunds", refundRow(thirdPaymentId, "refund-outside-page", olderAt, {}));

            clearProviderRequests(harness);
            const listedResponse = await harness.request("admin-1", "admin", "listProviderRefunds", { limit: "2" });
            expect(listedResponse.status).toBe(200);
            expect(await responseBody(listedResponse)).toEqual({
                refunds: [publicRefund(first, "order-refund-new"), publicRefund(second, "order-refund-old")],
                total: 2,
            });
            expect(postgrestTables(harness)).toEqual(["rpc/list_dashboard_refunds"]);
            expect(postgrestBody(harness, 0)).toEqual({
                p_actor_id: "admin-1",
                p_actor_kind: "admin",
                p_limit: 2,
                p_search: null,
                p_status: null,
            });
            expect(harness.rest.stripeRequests).toEqual([]);

            harness.rest.patchDashboardRow("refunds", Number(first.id), {
                status: "failed",
                failure_reason: "provider_declined",
            });
            clearProviderRequests(harness);
            const detailResponse = await harness.request("admin-1", "admin", "getProviderRefund", {
                refundId: String(first.id),
            });
            expect(detailResponse.status).toBe(200);
            expect(await responseBody(detailResponse)).toEqual(
                publicRefund({
                    ...first,
                    status: "failed",
                    failure_reason: "provider_declined",
                    updated_at: refreshedAt,
                }),
            );
            expect(postgrestTables(harness)).toEqual(["refunds"]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}

function refundRow(paymentId: number, requestId: string, at: string, patch: JsonRecord): JsonRecord {
    return {
        payment_id: paymentId,
        operation_id: paymentId + 100,
        refund_request_id: requestId,
        commerce_refund_request_id: paymentId + 200,
        stripe_charge_id: `ch_${paymentId}`,
        stripe_refund_id: `re_${paymentId}`,
        stripe_balance_transaction_id: null,
        amount: 400,
        required_reversal_amount: 300,
        seller_entitlement_reduction_amount: 300,
        authorized_seller_amount_after_refund: 780,
        currency: "eur",
        reason: "buyer_return",
        status: "succeeded",
        failure_reason: null,
        actual_stripe_fee_amount: -20,
        actual_stripe_net_amount: -380,
        actual_stripe_fee_currency: "eur",
        actual_stripe_fee_details: [{ type: "stripe_fee", amount: -20, currency: "eur" }],
        provider_snapshot: { id: `re_${paymentId}`, status: "succeeded" },
        created_at: at,
        updated_at: at,
        ...patch,
    };
}

function publicRefund(row: JsonRecord, clientReferenceId?: string): JsonRecord {
    return {
        refundId: row.id,
        providerOperationId: row.operation_id,
        paymentId: row.payment_id,
        refundRequestId: row.refund_request_id,
        commerceRefundRequestId: row.commerce_refund_request_id ?? null,
        stripeRefundId: row.stripe_refund_id,
        stripeBalanceTransactionId: row.stripe_balance_transaction_id,
        amount: row.amount,
        requiredReversalAmount: row.required_reversal_amount,
        sellerEntitlementReductionAmount: row.seller_entitlement_reduction_amount,
        authorizedSellerAmount: row.authorized_seller_amount_after_refund,
        currency: row.currency,
        reason: row.reason,
        status: row.status,
        failureReason: row.failure_reason,
        actualStripeFeeAmount: row.actual_stripe_fee_amount,
        actualStripeNetAmount: row.actual_stripe_net_amount,
        actualStripeFeeCurrency: row.actual_stripe_fee_currency,
        actualStripeFeeDetails: row.actual_stripe_fee_details,
        occurredAt: row.updated_at,
        providerSnapshot: row.provider_snapshot,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(clientReferenceId ? { clientReferenceId } : {}),
    };
}
