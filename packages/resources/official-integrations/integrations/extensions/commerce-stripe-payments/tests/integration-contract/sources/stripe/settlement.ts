import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";

export function stripeSettlementEndpoints(): Source["endpoints"] {
    return [
        {
            urn: makeEndpointUrn("stripe-connect", "requestSettlementRelease"),
            method: "POST",
            targetUrl: "https://stripe.test/settlement/release",
            input: {
                body: {
                    type: "object",
                    properties: {
                        paymentId: { type: "number" },
                        releaseAuthorizationId: { type: "string" },
                        releaseKind: { type: "string" },
                        amount: { type: "number" },
                        currency: { type: "string" },
                    },
                    required: ["paymentId", "releaseAuthorizationId", "releaseKind", "amount", "currency"],
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            providerOperationId: { type: "number" },
                            paymentId: { type: "number" },
                            releaseAuthorizationId: { type: "string" },
                            amount: { type: "number" },
                            currency: { type: "string" },
                            status: { type: "string" },
                            occurredAt: { type: "string" },
                            updatedAt: { type: "string" },
                        },
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "requestProtectedRefund"),
            method: "POST",
            targetUrl: "https://stripe.test/refund/protected",
            input: {
                body: {
                    type: "object",
                    properties: {
                        paymentId: { type: "number" },
                        refundRequestId: { type: "string" },
                        amount: { type: "number" },
                        commerceRefundRequestId: { type: "number" },
                        authorizedSellerAmount: { type: "number" },
                        sellerEntitlementReductionAmount: { type: "number" },
                        reason: { type: "string" },
                    },
                    required: [
                        "paymentId",
                        "refundRequestId",
                        "amount",
                        "authorizedSellerAmount",
                        "sellerEntitlementReductionAmount",
                    ],
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            payment: { type: "object" },
                            reversal: { type: "object", nullable: true },
                            refund: { type: "object" },
                            operations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        providerEventId: { type: "string" },
                                        providerOperationId: { type: "number" },
                                        operationType: { type: "string" },
                                        providerOperationObjectId: { type: "string" },
                                        status: { type: "string" },
                                        amount: { type: "number" },
                                        currency: { type: "string" },
                                        occurredAt: { type: "string" },
                                        refundRequestId: { type: "string" },
                                        providerSnapshot: { type: "object" },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "cancelProtectedPayment"),
            method: "POST",
            targetUrl: "https://stripe.test/payment/cancel",
            input: {
                body: {
                    type: "object",
                    properties: {
                        clientReferenceId: { type: "string" },
                        cancellationRequestId: { type: "string" },
                        reason: { type: "string" },
                    },
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            cancellationRequestId: { type: "string" },
                            providerOperationId: { type: "number" },
                            providerStatus: { type: "string" },
                            providerPaymentAbsent: { type: "boolean" },
                            providerEventId: { type: "string" },
                            providerPaymentId: { type: "number" },
                            providerPaymentIntentId: { type: "string" },
                            providerChargeId: { type: "string" },
                            paymentStatus: { type: "string" },
                            amount: { type: "number" },
                            currency: { type: "string" },
                            financialTermsHash: { type: "string" },
                            occurredAt: { type: "string" },
                            providerSnapshot: { type: "object" },
                            payment: {
                                type: "object",
                                properties: {
                                    paymentId: { type: "number" },
                                    stripePaymentIntentId: { type: "string" },
                                    stripeChargeId: { type: "string" },
                                    paymentStatus: { type: "string" },
                                    amountTotal: { type: "number" },
                                    currency: { type: "string" },
                                    financialTermsHash: { type: "string" },
                                    updatedAt: { type: "string" },
                                },
                            },
                        },
                    },
                },
            ],
        },
    ];
}
