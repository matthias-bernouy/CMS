import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";

export function stripePaymentLifecycleEndpoints(): Source["endpoints"] {
    return [
        {
            urn: makeEndpointUrn("stripe-connect", "createProtectedPayment"),
            method: "POST",
            targetUrl: "https://stripe.test/payment",
            headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                body: {
                    type: "object",
                    properties: {
                        sellerUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                        amountTotal: { type: "number" },
                        sellerTransferAmount: { type: "number" },
                        currency: { type: "string" },
                        clientReferenceId: { type: "string" },
                        financialTermsHash: { type: "string" },
                        financialRevision: { type: "number" },
                        dualApprovalThresholdAmount: { type: "number" },
                        description: { type: "string" },
                    },
                    required: [
                        "sellerUserId",
                        "amountTotal",
                        "sellerTransferAmount",
                        "currency",
                        "clientReferenceId",
                        "financialTermsHash",
                        "dualApprovalThresholdAmount",
                    ],
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            paymentId: { type: "number" },
                            stripePaymentIntentId: { type: "string" },
                            clientSecret: { type: "string" },
                            paymentStatus: { type: "string" },
                            commercePaymentStatus: { type: "string" },
                            settlementStatus: { type: "string" },
                            disputeStatus: { type: "string" },
                            refundedAmount: { type: "number" },
                            clientReferenceId: { type: "string" },
                            stripeChargeId: { type: "string" },
                            stripeChargeBalanceTransactionId: { type: "string" },
                            manualReviewReason: { type: "string" },
                            amountTotal: { type: "number" },
                            sellerTransferAmount: { type: "number" },
                            platformRetainedAmount: { type: "number" },
                            transferredAmount: { type: "number" },
                            reversedAmount: { type: "number" },
                            currency: { type: "string" },
                            financialTermsHash: { type: "string" },
                            updatedAt: { type: "string" },
                        },
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "getProtectedPaymentByClientReference"),
            method: "GET",
            access: { mode: "system" },
            targetUrl: "https://stripe.test/payment-by-reference",
            headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                params: [
                    {
                        name: "clientReferenceId",
                        in: "query",
                        schema: { type: "string" },
                    },
                ],
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            exists: { type: "boolean" },
                            payment: {
                                type: "object",
                                properties: {
                                    paymentId: { type: "number" },
                                    stripePaymentIntentId: { type: "string" },
                                    paymentStatus: { type: "string" },
                                    commercePaymentStatus: { type: "string" },
                                    settlementStatus: { type: "string" },
                                    disputeStatus: { type: "string" },
                                    reconciliationPending: { type: "boolean" },
                                    refundedAmount: { type: "number" },
                                    manualReviewReason: { type: "string" },
                                    amountTotal: { type: "number" },
                                    currency: { type: "string" },
                                    financialTermsHash: { type: "string" },
                                    stripeChargeId: { type: "string" },
                                    buyerUserId: { type: "string" },
                                    sellerUserId: { type: "string" },
                                    platformRetainedAmount: { type: "number" },
                                    actualPlatformMarginAfterStripeAmount: { type: "number" },
                                    updatedAt: { type: "string" },
                                },
                            },
                        },
                        required: ["exists"],
                    },
                },
            ],
        },
    ];
}
