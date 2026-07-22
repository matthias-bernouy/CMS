import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";

export function stripeReconciliationEndpoints(): Source["endpoints"] {
    return [
        {
            urn: makeEndpointUrn("stripe-connect", "runProviderReconciliation"),
            method: "POST",
            targetUrl: "https://stripe.test/reconciliation",
            input: {
                body: { type: "object", properties: { runKey: { type: "string" }, limit: { type: "number" } } },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            payments: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        paymentId: { type: "number" },
                                        clientReferenceId: { type: "string" },
                                        paymentStatus: { type: "string" },
                                        commercePaymentStatus: { type: "string" },
                                        providerEventId: { type: "string" },
                                        stripePaymentIntentId: { type: "string" },
                                        amountTotal: { type: "number" },
                                        currency: { type: "string" },
                                        financialTermsHash: { type: "string" },
                                        occurredAt: { type: "string" },
                                        stripeChargeId: { type: "string" },
                                        updatedAt: { type: "string" },
                                        projectionId: { type: "number" },
                                        projectionClaimToken: { type: "string" },
                                    },
                                },
                            },
                            commerceOperations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        orderPublicId: { type: "string" },
                                        providerOperationId: { type: "number" },
                                        operationType: { type: "string" },
                                        providerEventId: { type: "string" },
                                        status: { type: "string" },
                                        amount: { type: "number" },
                                        currency: { type: "string" },
                                        occurredAt: { type: "string" },
                                        updatedAt: { type: "string" },
                                        releaseAuthorizationId: { type: "string", nullable: true },
                                        refundRequestId: { type: "string" },
                                        commerceRefundRequestId: { type: "number" },
                                        providerSnapshot: { type: "object" },
                                        projectionId: { type: "number" },
                                        projectionClaimToken: { type: "string" },
                                    },
                                },
                            },
                            disputes: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        clientReferenceId: { type: "string" },
                                        status: { type: "string" },
                                        providerEventId: { type: "string" },
                                        reason: { type: "string" },
                                        amount: { type: "number" },
                                        currency: { type: "string" },
                                        createdAt: { type: "string" },
                                        updatedAt: { type: "string" },
                                        evidenceDueBy: { type: "string" },
                                        projectionId: { type: "number" },
                                        projectionClaimToken: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "acknowledgeCommerceProjection"),
            method: "POST",
            targetUrl: "https://stripe.test/reconciliation/projections/ack",
            input: {
                body: {
                    type: "object",
                    properties: {
                        projectionId: { type: "number" },
                        claimToken: { type: "string" },
                    },
                },
            },
            output: [{ status: "200", body: { type: "object" } }],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "failCommerceProjection"),
            method: "POST",
            targetUrl: "https://stripe.test/reconciliation/projections/fail",
            input: {
                body: {
                    type: "object",
                    properties: {
                        projectionId: { type: "number" },
                        claimToken: { type: "string" },
                        error: { type: "string" },
                    },
                },
            },
            output: [{ status: "200", body: { type: "object" } }],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "listStripeDisputes"),
            method: "GET",
            targetUrl: "https://stripe.test/disputes",
            input: { params: [{ name: "limit", in: "query", schema: { type: "number" } }] },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            disputes: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        clientReferenceId: { type: "string" },
                                        status: { type: "string" },
                                        reason: { type: "string" },
                                        amount: { type: "number" },
                                        currency: { type: "string" },
                                        createdAt: { type: "string" },
                                        updatedAt: { type: "string" },
                                        evidenceDueBy: { type: "string" },
                                    },
                                },
                            },
                            total: { type: "number" },
                        },
                    },
                },
            ],
        },
    ];
}
