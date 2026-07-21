import { describe, expect, test } from "bun:test";
import {
    createPaymentLedgerFixture,
    paymentLedgerFinancialTermsHash,
    successfulJson,
    type CreateProviderReconciliationHarness,
} from "../harness";

export function registerPaymentReconciliationLedgerContracts(
    createHarness: CreateProviderReconciliationHarness,
): void {
    describe("stripe-connect payment reconciliation ledger contracts", () => {
        test("preserves the exact payment projection with one aggregate read", async () => {
            const fixture = await createPaymentLedgerFixture(createHarness, "payment-ledger-contract");

            const result = await successfulJson(await fixture.submit(
                "system-ledger", "reconcileProviderPayment", { paymentId: fixture.paymentId },
            ));

            expect(result).toEqual({
                paymentId: fixture.paymentId,
                providerPaymentId: fixture.paymentId,
                clientReferenceId: "payment-ledger-contract",
                financialTermsHash: paymentLedgerFinancialTermsHash,
                financialRevision: 1,
                dualApprovalThresholdAmount: 1000,
                buyerUserId: "user-123",
                sellerUserId: "seller-ledger",
                stripePaymentIntentId: fixture.paymentIntentId,
                stripeChargeId: "ch_1",
                stripeChargeBalanceTransactionId: "txn_charge_1",
                providerEventId: null,
                transferGroup: expect.stringMatching(/^cms_order_[a-f0-9]{64}$/),
                currency: "eur",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                platformRetainedAmount: 120,
                refundedAmount: 200,
                transferredAmount: 900,
                reversedAmount: 200,
                actualStripeChargeFeeAmount: 65,
                actualStripeRefundFeeAmount: 0,
                actualStripeProcessingFeeAmount: 65,
                actualStripeChargeNetAmount: 1135,
                actualStripeFeeCurrency: "eur",
                actualStripeChargeFeeDetails: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
                actualPlatformMarginAfterStripeAmount: 55,
                paymentStatus: "succeeded",
                commercePaymentStatus: "succeeded",
                settlementStatus: "held",
                disputeStatus: "none",
                reconciliationPending: false,
                manualReviewReason: null,
                description: null,
                paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
                cancelledAt: null,
                lastProviderSyncAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
                occurredAt: "2026-07-06T12:10:00.000Z",
                createdAt: "2026-07-06T12:05:00.000Z",
                updatedAt: "2026-07-06T12:10:00.000Z",
            });
            expect(fixture.rest.stripeRequests.map(request => [request.method, request.pathname]))
                .toEqual([
                    ["GET", `/v1/payment_intents/${fixture.paymentIntentId}`],
                    ["GET", "/v1/disputes"],
                    ["GET", "/v1/refunds"],
                    ["GET", "/v1/transfers"],
                ]);
            expect(fixture.rest.postgrestRequests.map(request => [request.method, request.table]))
                .toEqual([
                    ["GET", "payments"],
                    ["POST", "rpc/apply_payment_provider_projection"],
                    ["GET", "payments"],
                    ["GET", "refunds"],
                    ["POST", "rpc/read_payment_reconciliation_ledger"],
                    ["PATCH", "payments"],
                ]);
        });

        test("never reads the ledger when provider refresh fails", async () => {
            const fixture = await createPaymentLedgerFixture(createHarness, "payment-ledger-provider-failure");
            fixture.rest.failNextPaymentIntentRetrieve();

            const failed = await fixture.submit(
                "system-ledger", "reconcileProviderPayment", { paymentId: fixture.paymentId },
            );

            expect(failed.status).toBe(502);
            expect(await failed.json()).toEqual({ error: "simulated Stripe provider outage" });
            expect(fixture.rest.postgrestRequests.map(request => request.table)).toEqual(["payments"]);
        });

        test("does not apply final totals when the aggregate read fails", async () => {
            const fixture = await createPaymentLedgerFixture(createHarness, "payment-ledger-db-failure");
            fixture.rest.failNextPaymentReconciliationLedgerRead();

            const failed = await fixture.submit(
                "system-ledger", "reconcileProviderPayment", { paymentId: fixture.paymentId },
            );

            expect(failed.status).toBe(502);
            expect(await failed.json()).toEqual({ error: "simulated payment ledger read failure" });
            expect(fixture.rest.rows("payments")[0]).toMatchObject({
                payment_status: "succeeded",
                refunded_amount: 0,
                transferred_amount: 0,
                reversed_amount: 0,
            });
            expect(["transfers", "rpc/read_payment_reconciliation_ledger"])
                .toContain(fixture.rest.postgrestRequests.at(-1)?.table);
        });
    });
}
