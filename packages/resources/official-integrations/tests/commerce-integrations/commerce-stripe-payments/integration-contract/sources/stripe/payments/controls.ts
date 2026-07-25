import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";

export function stripePaymentControlEndpoints(): Source["endpoints"] {
    return [
        {
            urn: makeEndpointUrn("stripe-connect", "configurePlatformPayoutControls"),
            method: "POST",
            targetUrl: "https://stripe.test/payout/platform",
            input: {
                body: {
                    type: "object",
                    properties: {
                        platformPayoutControlChangeId: { type: "string" },
                        minimumBalanceEur: { type: "number" },
                        liabilityRevision: { type: "number" },
                        decreaseAuthorizationId: { type: "string", nullable: true },
                        delayDaysOverride: { type: "number" },
                        debitNegativeBalances: { type: "boolean" },
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
                            liabilityRevision: { type: "number" },
                            appliedMinimumBalanceEur: { type: "number" },
                            decreaseAuthorizationId: { type: "string", nullable: true },
                            payoutControl: { type: "object" },
                        },
                    },
                },
                {
                    status: "409",
                    body: {
                        type: "object",
                        properties: {
                            error: { type: "string" },
                        },
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "configureSellerPayoutSchedule"),
            method: "POST",
            targetUrl: "https://stripe.test/payout/seller",
            input: {
                body: {
                    type: "object",
                    properties: {
                        userId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                        payoutScheduleChangeId: { type: "string" },
                        payoutSchedule: { type: "string" },
                        interval: { type: "string" },
                        weeklyPayoutDays: { type: "array", items: { type: "string" } },
                        monthlyPayoutDays: { type: "array", items: { type: "number" } },
                        minimumBalanceEur: { type: "number" },
                        delayDaysOverride: { type: "number" },
                        debitNegativeBalances: { type: "boolean" },
                        reason: { type: "string" },
                    },
                },
            },
            output: [{ status: "200", body: { type: "object" } }],
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
                                    clientReferenceId: { type: "string" },
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
