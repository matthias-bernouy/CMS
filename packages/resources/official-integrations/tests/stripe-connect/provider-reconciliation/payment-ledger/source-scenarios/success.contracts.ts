import { expect, test } from "bun:test";
import { financialTermsHash, isoTimestampPattern } from "../../../runtime/constants";
import { okJson } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import type { JsonRecord } from "../../../runtime/types";
import type { CreatePaymentRecoveryScenarioHarness } from "./harness";

export function registerLostPaymentRecoveryScenario(createHarness: CreatePaymentRecoveryScenarioHarness): void {
    test("reconciles a succeeded PaymentIntent when its webhook was lost", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "lost-payment-webhook-order",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        harness.rest.clearStripeRequests();

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "lost-payment-webhook-reconciliation",
                limit: 25,
            }),
        );
        const payments = reconciliation.payments as JsonRecord[];
        const operations = reconciliation.operations as JsonRecord[];
        expect(reconciliation.finishedAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(payments[0]?.paidAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(payments[0]?.lastProviderSyncAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(payments[1]?.paidAt).toBe(payments[0]?.paidAt);
        expect(payments[1]?.lastProviderSyncAt).toBe(payments[0]?.lastProviderSyncAt);
        expect(operations[0]?.claimedAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(operations[0]?.completedAt).toEqual(expect.stringMatching(isoTimestampPattern));
        const transferGroup = "cms_order_3335ee91cff910e16ec8360d9a159c7d08a409c9b7307cb706e78a7e1247f2c3";
        const expectedPayment = {
            paymentId: 1,
            providerPaymentId: 1,
            clientReferenceId: "lost-payment-webhook-order",
            financialTermsHash,
            financialRevision: 1,
            buyerUserId: "user-123",
            sellerUserId: "seller-1",
            stripePaymentIntentId: "pi_1",
            stripeChargeId: "ch_1",
            transferGroup,
            currency: "eur",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            platformRetainedAmount: 120,
            refundedAmount: 0,
            transferredAmount: 0,
            reversedAmount: 0,
            stripeChargeBalanceTransactionId: "txn_charge_1",
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
            manualReviewReason: null,
            description: null,
            paidAt: payments[0]?.paidAt,
            cancelledAt: null,
            lastProviderSyncAt: payments[0]?.lastProviderSyncAt,
            occurredAt: "2026-07-06T12:10:00.000Z",
            projectionAttemptCount: 1,
            causalSequence: 0,
            createdAt: "2026-07-06T12:05:00.000Z",
            updatedAt: "2026-07-06T12:10:00.000Z",
        };
        expect(reconciliation).toEqual({
            runId: 4,
            runKey: "lost-payment-webhook-reconciliation",
            status: "succeeded",
            scannedCount: 1,
            repairedCount: 1,
            exceptionCount: 0,
            details: {
                stripeApiVersion: "2026-02-25.clover",
                processedStripeEvents: 0,
                recoveredFinancialOperations: 0,
                reconciledStalePayments: 1,
                reconciledSellerRiskAccounts: 0,
                reconciledManualPayoutHolds: 0,
                platformPayoutInterval: "daily",
                platformPayoutMinimum: 0,
                platformRequiredMinimum: 0,
                workBudgetLimit: 25,
                workBudgetConsumed: 1,
            },
            finishedAt: reconciliation.finishedAt,
            payments: [
                {
                    ...expectedPayment,
                    providerEventId:
                        "payment:1:payment-intent-create:created:none:8ff5f26ecf043c8d4f737fc241bfd33465c18f801f18a0b233274e521c3f3129",
                    projectionId: 3,
                    projectionClaimToken: "claim-3-1",
                },
                {
                    ...expectedPayment,
                    providerEventId:
                        "payment:1:provider-sync:succeeded:ch_1:9d3a23058256c7334017e4d1d1c5679af6efbc0d7ffb6c1c536eb254a04d433b",
                    projectionId: 5,
                    projectionClaimToken: "claim-5-1",
                },
            ],
            operations: [
                {
                    providerOperationId: 2,
                    paymentId: 1,
                    providerPaymentId: 1,
                    clientReferenceId: "lost-payment-webhook-order",
                    businessKey: `payment:1:${financialTermsHash}`,
                    operationType: "payment_intent_create",
                    status: "succeeded",
                    amount: 1200,
                    currency: "eur",
                    releaseAuthorizationId: null,
                    refundRequestId: null,
                    commerceRefundRequestId: null,
                    stripeObjectId: "pi_1",
                    request: {
                        amount: 1200,
                        currency: "eur",
                        clientReferenceId: "lost-payment-webhook-order",
                        financialTermsHash,
                        transferGroup,
                    },
                    response: {
                        id: "pi_1",
                        status: "requires_payment_method",
                        amount: 1200,
                        amount_received: 0,
                        currency: "eur",
                        transfer_group: transferGroup,
                        metadata: {
                            cms_payment_id: "1",
                            client_reference_id: "lost-payment-webhook-order",
                            financial_terms_hash: financialTermsHash,
                            seller_cms_user_id: "seller-1",
                        },
                        latest_charge: null,
                    },
                    lastError: null,
                    attemptCount: 1,
                    nextAttemptAt: null,
                    claimedAt: operations[0]?.claimedAt,
                    completedAt: operations[0]?.completedAt,
                    providerEventId: "operation:2:succeeded",
                    occurredAt: "2026-07-06T12:10:00.000Z",
                    createdAt: "2026-07-06T12:04:00.000Z",
                    updatedAt: "2026-07-06T12:10:00.000Z",
                },
            ],
            commerceOperations: [],
            disputes: [],
        });
        expect(harness.rest.rows("payments")[0]).toMatchObject({
            stripe_charge_balance_transaction_id: "txn_charge_1",
            actual_stripe_charge_fee_amount: 65,
            actual_stripe_refund_fee_amount: 0,
            actual_stripe_processing_fee_amount: 65,
        });
        expect(harness.rest.stripeRequests).toEqual([
            {
                method: "GET",
                pathname: "/v1/balance_settings",
                searchParams: [],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "GET",
                pathname: "/v1/payment_intents/pi_1",
                searchParams: [["expand[]", "latest_charge.balance_transaction"]],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "GET",
                pathname: "/v1/disputes",
                searchParams: [
                    ["charge", "ch_1"],
                    ["limit", "100"],
                ],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "GET",
                pathname: "/v1/refunds",
                searchParams: [
                    ["charge", "ch_1"],
                    ["limit", "100"],
                ],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "GET",
                pathname: "/v1/transfers",
                searchParams: [
                    ["transfer_group", transferGroup],
                    ["limit", "100"],
                ],
                idempotencyKey: null,
                stripeAccount: null,
            },
        ]);
    });
}
