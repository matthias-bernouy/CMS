import { describe, expect, test } from "bun:test";
import {
    buyerUserId,
    createPaymentProjectionFixture,
    financialTermsHash,
    postgrestCalls,
    sellerUserId,
    successfulJson,
    transferGroup,
    type CreatePaymentProjectionHarness,
    type JsonRecord,
} from "./harness";

const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function registerPaymentProjectionContracts(
    createHarness: CreatePaymentProjectionHarness,
): void {
    describe("stripe-connect payment provider projection contracts", () => {
        test("preserves the exact successful provider projection and privacy boundary", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-success");
            fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            fixture.resetRequests();

            const body = await successfulJson(await fixture.read());

            expect(body.paidAt).toEqual(expect.stringMatching(isoTimestamp));
            expect(body.lastProviderSyncAt).toEqual(expect.stringMatching(isoTimestamp));
            expect(body).toEqual(await successfulPayment(body, fixture.clientReferenceId));
            expect(JSON.stringify(body)).not.toContain("providerSnapshot");
            expect(JSON.stringify(body)).not.toContain("sellerStripeAccountId");
            expect(JSON.stringify(body)).not.toContain("clientSecret");
            expect(postgrestCalls(fixture)).toEqual([
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
            ]);
            expect(fixture.rest.stripeRequests.map(request => [request.method, request.pathname])).toEqual([
                ["GET", `/v1/payment_intents/${fixture.paymentIntentId}`],
            ]);
        });

        test("preserves the exact provider projection returned by client reference", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-reference");
            fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            fixture.resetRequests();

            const body = await successfulJson(await fixture.request(
                buyerUserId,
                "getProtectedPaymentByClientReference",
                { clientReferenceId: fixture.clientReferenceId },
            ));
            const payment = body.payment as JsonRecord;

            expect(body).toEqual({
                exists: true,
                payment: await successfulPayment(payment, fixture.clientReferenceId),
            });
            expect(postgrestCalls(fixture)).toEqual([
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
            ]);
            expect(fixture.rest.stripeRequests.map(request => [request.method, request.pathname])).toEqual([
                ["GET", `/v1/payment_intents/${fixture.paymentIntentId}`],
            ]);
        });

        test("preserves fail-closed quarantine state, exception, event, and response", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-quarantine");
            fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            fixture.rest.patchPaymentIntent(fixture.paymentIntentId, { amount: 1199 });
            fixture.resetRequests();

            const body = await successfulJson(await fixture.read());
            const reason = "Stripe payment provider truth mismatch: payment_intent_amount";

            expect(body).toMatchObject({
                paymentId: fixture.paymentId,
                clientReferenceId: fixture.clientReferenceId,
                paymentStatus: "failed",
                commercePaymentStatus: "manual_review",
                settlementStatus: "manual_review",
                reconciliationPending: false,
                manualReviewReason: reason,
                paidAt: null,
            });
            expect(Object.keys(body).sort()).toEqual([...successfulPaymentKeys].sort());
            expect(fixture.rest.rows("provider_exceptions")).toEqual([
                expect.objectContaining({
                    payment_id: fixture.paymentId,
                    exception_type: "provider_payment_truth_mismatch",
                    severity: "critical",
                    status: "open",
                    message: reason,
                    details: {
                        paymentIntentId: fixture.paymentIntentId,
                        chargeId: "ch_1",
                        mismatches: ["payment_intent_amount"],
                    },
                }),
            ]);
            expect(fixture.rest.rows("payment_events")).toEqual([
                expect.objectContaining({
                    payment_id: fixture.paymentId,
                    event_type: "provider_payment_truth_mismatch",
                    actor_kind: "reconciliation",
                    actor_id: "provider-sync",
                    data: {
                        paymentIntentId: fixture.paymentIntentId,
                        chargeId: "ch_1",
                        mismatches: ["payment_intent_amount"],
                    },
                }),
            ]);
            expect(postgrestCalls(fixture)).toEqual([
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
            ]);
        });
    });
}

const successfulPaymentKeys = [
    "paymentId", "providerPaymentId", "clientReferenceId", "financialTermsHash",
    "financialRevision", "buyerUserId", "sellerUserId", "stripePaymentIntentId",
    "stripeChargeId", "providerEventId", "transferGroup", "currency", "amountTotal", "sellerTransferAmount",
    "platformRetainedAmount", "refundedAmount", "transferredAmount", "reversedAmount",
    "stripeChargeBalanceTransactionId",
    "actualStripeChargeFeeAmount", "actualStripeRefundFeeAmount", "actualStripeProcessingFeeAmount",
    "actualStripeChargeNetAmount", "actualStripeFeeCurrency", "actualStripeChargeFeeDetails",
    "actualPlatformMarginAfterStripeAmount", "paymentStatus", "commercePaymentStatus",
    "settlementStatus", "disputeStatus", "reconciliationPending", "manualReviewReason",
    "paidAt", "cancelledAt", "lastProviderSyncAt", "occurredAt", "createdAt",
    "updatedAt",
];

async function successfulPayment(body: JsonRecord, clientReferenceId: string): Promise<JsonRecord> {
    return {
        paymentId: 1, providerPaymentId: 1, clientReferenceId, financialTermsHash,
        financialRevision: 1, buyerUserId, sellerUserId, stripePaymentIntentId: "pi_1",
        stripeChargeId: "ch_1", stripeChargeBalanceTransactionId: "txn_charge_1",
        providerEventId: null, transferGroup: await transferGroup(clientReferenceId),
        currency: "eur", amountTotal: 1200, sellerTransferAmount: 1080,
        platformRetainedAmount: 120, refundedAmount: 0, transferredAmount: 0,
        reversedAmount: 0, actualStripeChargeFeeAmount: 65,
        actualStripeRefundFeeAmount: 0, actualStripeProcessingFeeAmount: 65,
        actualStripeChargeNetAmount: 1135, actualStripeFeeCurrency: "eur",
        actualStripeChargeFeeDetails: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
        actualPlatformMarginAfterStripeAmount: 55, paymentStatus: "succeeded",
        commercePaymentStatus: "succeeded", settlementStatus: "held", disputeStatus: "none",
        reconciliationPending: false, manualReviewReason: null,
        paidAt: body.paidAt, cancelledAt: null, lastProviderSyncAt: body.lastProviderSyncAt,
        occurredAt: "2026-07-06T12:10:00.000Z", createdAt: "2026-07-06T12:05:00.000Z",
        updatedAt: "2026-07-06T12:10:00.000Z",
    };
}
