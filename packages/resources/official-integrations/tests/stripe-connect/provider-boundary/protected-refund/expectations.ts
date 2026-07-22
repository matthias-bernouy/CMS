import { expect } from "bun:test";
import { financialTermsHash, type JsonRecord, paymentIntentRequest, type StripeRequestRecord } from "../harness";

type RefundResponseOptions = {
    providerId: string;
    balanceTransactionId: string;
    settlementStatus?: "held" | "manual_review";
    manualReviewReason?: string | null;
};

export function expectedProtectedRefundResponse(actual: JsonRecord, options: RefundResponseOptions): JsonRecord {
    const payment = record(actual.payment);
    const refund = record(actual.refund);
    const providerSnapshot = expectedRefundSnapshot(options.providerId, options.balanceTransactionId);
    const manualReviewReason = options.manualReviewReason ?? null;
    const settlementStatus = options.settlementStatus ?? "held";
    const providerOperationId = refund.providerOperationId;
    return {
        payment: {
            paymentId: 1,
            providerPaymentId: 1,
            clientReferenceId: "provider-order-1",
            financialTermsHash,
            financialRevision: 1,
            dualApprovalThresholdAmount: 1000,
            buyerUserId: "buyer-1",
            sellerUserId: "seller-1",
            stripePaymentIntentId: "pi_1",
            stripeChargeId: "ch_1",
            stripeChargeBalanceTransactionId: "txn_charge_1",
            providerEventId: null,
            transferGroup: "cms_order_5a66e34d5f14d1ea34206f0ee2e0c236b961ff46e95cbb568d051704dae96881",
            currency: "eur",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            platformRetainedAmount: 120,
            refundedAmount: 300,
            transferredAmount: 0,
            reversedAmount: 0,
            actualStripeChargeFeeAmount: 65,
            actualStripeRefundFeeAmount: 0,
            actualStripeProcessingFeeAmount: 65,
            actualStripeChargeNetAmount: 1135,
            actualStripeFeeCurrency: "eur",
            actualStripeChargeFeeDetails: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
            actualPlatformMarginAfterStripeAmount: 55,
            paymentStatus: "succeeded",
            commercePaymentStatus: settlementStatus === "manual_review" ? "manual_review" : "succeeded",
            settlementStatus,
            disputeStatus: "none",
            reconciliationPending: false,
            manualReviewReason,
            description: null,
            paidAt: payment.paidAt,
            cancelledAt: null,
            lastProviderSyncAt: payment.lastProviderSyncAt,
            occurredAt: "2026-07-06T12:10:00.000Z",
            createdAt: "2026-07-06T12:05:00.000Z",
            updatedAt: "2026-07-06T12:10:00.000Z",
        },
        reversal: null,
        refund: {
            refundId: refund.refundId,
            providerOperationId,
            paymentId: 1,
            refundRequestId: "protected-refund-1",
            commerceRefundRequestId: 701,
            stripeRefundId: options.providerId,
            stripeBalanceTransactionId: options.balanceTransactionId,
            amount: 300,
            requiredReversalAmount: 0,
            sellerEntitlementReductionAmount: 300,
            authorizedSellerAmount: 780,
            currency: "eur",
            reason: "partial buyer remedy",
            status: "succeeded",
            failureReason: null,
            actualStripeFeeAmount: 0,
            actualStripeNetAmount: -300,
            actualStripeFeeCurrency: "eur",
            actualStripeFeeDetails: [],
            occurredAt: "2026-07-06T12:10:00.000Z",
            providerSnapshot,
            createdAt: "2026-07-06T12:05:00.000Z",
            updatedAt: "2026-07-06T12:10:00.000Z",
        },
        operations: [
            {
                providerEventId: `operation:${String(providerOperationId)}:succeeded`,
                providerOperationId,
                operationType: "refund",
                providerOperationObjectId: options.providerId,
                status: "succeeded",
                amount: 300,
                currency: "eur",
                occurredAt: "2026-07-06T12:10:00.000Z",
                refundRequestId: "protected-refund-1",
                commerceRefundRequestId: 701,
                providerSnapshot,
            },
        ],
    };
}

export function expectedRefundListRequest(): StripeRequestRecord {
    return {
        method: "GET",
        pathname: "/v1/refunds",
        searchParams: [
            ["charge", "ch_1"],
            ["limit", "100"],
            ["expand[]", "data.balance_transaction"],
        ],
        idempotencyKey: null,
        stripeAccount: null,
    };
}

export function expectedRefundPreflightRequests(
    paymentIntentId = "pi_1",
    chargeId = "ch_1",
    transferGroup = "cms_order_5a66e34d5f14d1ea34206f0ee2e0c236b961ff46e95cbb568d051704dae96881",
): StripeRequestRecord[] {
    return [
        paymentIntentRequest(paymentIntentId),
        stripeGet("/v1/disputes", [
            ["charge", chargeId],
            ["limit", "100"],
        ]),
        stripeGet("/v1/refunds", [
            ["charge", chargeId],
            ["limit", "100"],
        ]),
        stripeGet("/v1/transfers", [
            ["transfer_group", transferGroup],
            ["limit", "100"],
        ]),
    ];
}

export function assertProtectedRefundPrivacy(body: JsonRecord): void {
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("clientSecret");
    expect(serialized).not.toContain("_secret");
    expect(serialized).not.toContain("acct_");
    expect(serialized).not.toContain("sk_test");
    expect(serialized).not.toContain("supabase-secret-key");
}

function expectedRefundSnapshot(providerId: string, balanceTransactionId: string): JsonRecord {
    return {
        id: providerId,
        charge: "ch_1",
        amount: 300,
        currency: "eur",
        status: "succeeded",
        metadata: {
            refund_request_id: "protected-refund-1",
            commerce_reason: "partial buyer remedy",
        },
        balance_transaction: {
            id: balanceTransactionId,
            amount: -300,
            fee: 0,
            net: -300,
            currency: "eur",
            fee_details: [],
        },
    };
}

function record(value: unknown): JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stripeGet(pathname: string, searchParams: Array<[string, string]>): StripeRequestRecord {
    return { method: "GET", pathname, searchParams, idempotencyKey: null, stripeAccount: null };
}
