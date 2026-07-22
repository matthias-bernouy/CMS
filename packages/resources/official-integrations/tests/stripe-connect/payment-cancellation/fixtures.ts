import { expect } from "bun:test";
import type { JsonRecord, PaymentCancellationFixture, StripeRequestRecord } from "./harness";

export const updatedAt = "2026-07-06T12:10:00.000Z";
const createdAt = "2026-07-06T12:05:00.000Z";
const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function cancelledPayment(fixture: PaymentCancellationFixture, paymentIntentId: string): JsonRecord {
    return {
        paymentId: fixture.paymentId,
        providerPaymentId: fixture.paymentId,
        clientReferenceId: fixture.clientReferenceId,
        financialTermsHash: "a".repeat(64),
        financialRevision: 1,
        dualApprovalThresholdAmount: 1000,
        buyerUserId: fixture.buyerUserId,
        sellerUserId: `seller-${fixture.clientReferenceId}`,
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: null,
        stripeChargeBalanceTransactionId: null,
        providerEventId: null,
        transferGroup: fixture.transferGroup,
        currency: "eur",
        amountTotal: 1200,
        sellerTransferAmount: 1080,
        platformRetainedAmount: 120,
        refundedAmount: 0,
        transferredAmount: 0,
        reversedAmount: 0,
        actualStripeChargeFeeAmount: 0,
        actualStripeRefundFeeAmount: 0,
        actualStripeProcessingFeeAmount: 0,
        actualStripeChargeNetAmount: null,
        actualStripeFeeCurrency: null,
        actualStripeChargeFeeDetails: [],
        actualPlatformMarginAfterStripeAmount: 120,
        paymentStatus: "cancelled",
        commercePaymentStatus: "cancelled",
        settlementStatus: "held",
        disputeStatus: "none",
        reconciliationPending: false,
        manualReviewReason: null,
        description: "Cancellation order",
        paidAt: null,
        cancelledAt: expect.stringMatching(isoTimestamp),
        lastProviderSyncAt: expect.stringMatching(isoTimestamp),
        occurredAt: updatedAt,
        createdAt,
        updatedAt,
    };
}

export function cancellationResponse(
    fixture: PaymentCancellationFixture,
    operationId: number,
    paymentIntentId: string,
): JsonRecord {
    const providerSnapshot = cancelledPayment(fixture, paymentIntentId);
    return {
        cancellationRequestId: fixture.cancellationRequestId,
        providerOperationId: operationId,
        providerStatus: "canceled",
        payment: {
            paymentId: fixture.paymentId,
            stripePaymentIntentId: paymentIntentId,
            stripeChargeId: null,
            clientReferenceId: fixture.clientReferenceId,
            paymentStatus: "cancelled",
            settlementStatus: "held",
            amountTotal: 1200,
            currency: "eur",
            financialTermsHash: "a".repeat(64),
            cancelledAt: expect.stringMatching(isoTimestamp),
            updatedAt,
        },
        providerPaymentAbsent: false,
        providerEventId: `payment-cancellation:${operationId}:${updatedAt}`,
        paymentStatus: "cancelled",
        providerPaymentId: fixture.paymentId,
        providerPaymentIntentId: paymentIntentId,
        providerChargeId: null,
        amount: 1200,
        currency: "eur",
        financialTermsHash: "a".repeat(64),
        occurredAt: updatedAt,
        providerSnapshot,
    };
}

export function cancelledIntent(fixture: PaymentCancellationFixture, paymentIntentId: string): JsonRecord {
    return {
        id: paymentIntentId,
        client_secret: `${paymentIntentId}_secret`,
        status: "canceled",
        amount: 1200,
        amount_received: 0,
        currency: "eur",
        transfer_group: fixture.transferGroup,
        metadata: {
            cms_payment_id: String(fixture.paymentId),
            client_reference_id: fixture.clientReferenceId,
            financial_terms_hash: "a".repeat(64),
            seller_cms_user_id: `seller-${fixture.clientReferenceId}`,
        },
        latest_charge: null,
        canceled_at: expect.any(Number),
    };
}

export function retrieveRequest(paymentIntentId: string): StripeRequestRecord {
    return {
        method: "GET",
        pathname: `/v1/payment_intents/${paymentIntentId}`,
        searchParams: [["expand[]", "latest_charge.balance_transaction"]],
        idempotencyKey: null,
        stripeAccount: null,
    };
}

export function cancelRequest(paymentIntentId: string, idempotencyKey: string): StripeRequestRecord {
    return {
        method: "POST",
        pathname: `/v1/payment_intents/${paymentIntentId}/cancel`,
        searchParams: [],
        idempotencyKey,
        stripeAccount: null,
    };
}

export function createRequest(fixture: PaymentCancellationFixture): StripeRequestRecord {
    return {
        method: "POST",
        pathname: "/v1/payment_intents",
        searchParams: [],
        idempotencyKey: `payment:${fixture.paymentId}:${"a".repeat(64)}`,
        stripeAccount: null,
    };
}
