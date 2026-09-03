import { describe, expect, test } from "bun:test";
import {
    clearProviderRequests,
    dashboardPaymentSelect,
    newerAt,
    olderAt,
    responseBody,
    type CreateDashboardReadHarness,
    type JsonRecord,
} from "./dashboard-contract-harness";

export function registerPaymentDashboardContracts(createHarness: CreateDashboardReadHarness): void {
    describe("stripe-connect payment dashboard read contracts", () => {
        test("keeps combined filters, search, ordering, and exact list payloads in one database read", async () => {
            const harness = await createHarness();
            const firstId = harness.rest.seedDashboardPayment("needle-new", {
                created_at: newerAt,
                last_provider_sync_at: newerAt,
                updated_at: newerAt,
            });
            const secondId = harness.rest.seedDashboardPayment("secondary-order", {
                buyer_cms_user_id: "buyer-needle",
                created_at: olderAt,
                last_provider_sync_at: olderAt,
                updated_at: olderAt,
            });
            harness.rest.seedDashboardPayment("needle-wrong-status", { payment_status: "failed" });
            harness.rest.seedDashboardPayment("needle-wrong-settlement", { settlement_status: "released" });
            harness.rest.seedDashboardPayment("outside-search");
            const rows = harness.rest.rows("payments");
            const first = rows.find((row) => row.id === firstId)!;
            const second = rows.find((row) => row.id === secondId)!;

            clearProviderRequests(harness);
            const response = await harness.request("admin-1", "admin", "listProviderPayments", {
                limit: "2",
                q: "needle",
                paymentStatus: "succeeded",
                settlementStatus: "held",
            });

            expect(response.status).toBe(200);
            expect(await responseBody(response)).toEqual({
                payments: [publicListedPayment(first), publicListedPayment(second)],
                total: 2,
            });
            expect(harness.rest.postgrestRequests).toEqual([
                {
                    method: "GET",
                    table: "payments",
                    searchParams: [
                        ["select", dashboardPaymentSelect],
                        ["order", "created_at.desc"],
                        ["limit", "2"],
                        ["payment_status", "eq.succeeded"],
                        ["settlement_status", "eq.held"],
                        [
                            "or",
                            "(client_reference_id.ilike.*needle*,buyer_cms_user_id.ilike.*needle*,seller_cms_user_id.ilike.*needle*,stripe_payment_intent_id.ilike.*needle*)",
                        ],
                    ],
                    body: null,
                },
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}

function publicListedPayment(row: JsonRecord): JsonRecord {
    return {
        paymentId: row.id,
        providerPaymentId: row.id,
        clientReferenceId: row.client_reference_id,
        financialTermsHash: row.financial_terms_hash,
        financialRevision: row.financial_revision,
        buyerUserId: row.buyer_cms_user_id,
        sellerUserId: row.seller_cms_user_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        stripeChargeId: row.stripe_charge_id,
        stripeChargeBalanceTransactionId: row.stripe_charge_balance_transaction_id,
        providerEventId: row.last_stripe_event_id,
        transferGroup: row.transfer_group,
        currency: row.currency,
        amountTotal: row.amount_total,
        sellerTransferAmount: row.seller_transfer_amount,
        platformRetainedAmount: row.platform_retained_amount,
        refundedAmount: row.refunded_amount,
        transferredAmount: row.transferred_amount,
        reversedAmount: row.reversed_amount,
        actualStripeChargeFeeAmount: row.actual_stripe_charge_fee_amount,
        actualStripeRefundFeeAmount: row.actual_stripe_refund_fee_amount,
        actualStripeProcessingFeeAmount: row.actual_stripe_processing_fee_amount,
        actualStripeChargeNetAmount: row.actual_stripe_charge_net_amount,
        actualStripeFeeCurrency: row.actual_stripe_fee_currency,
        actualStripeChargeFeeDetails: row.actual_stripe_charge_fee_details,
        actualPlatformMarginAfterStripeAmount:
            Number(row.platform_retained_amount) - Number(row.actual_stripe_processing_fee_amount),
        paymentStatus: row.payment_status,
        settlementStatus: row.settlement_status,
        disputeStatus: row.dispute_status,
        manualReviewReason: row.manual_review_reason,
        description: row.description,
        paidAt: row.paid_at,
        cancelledAt: row.cancelled_at,
        lastProviderSyncAt: row.last_provider_sync_at,
        occurredAt: row.updated_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
