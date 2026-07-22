import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";

export function commercePaymentEndpoints(): Source["endpoints"] {
    return [
        {
            urn: makeEndpointUrn("commerce", "recordOrderPayment"),
            method: "POST",
            targetUrl: "https://commerce.test/payment/record",
            input: {
                body: {
                    type: "object",
                    properties: {
                        orderPublicId: { type: "string" },
                        providerEventId: { type: "string" },
                        providerPaymentId: { type: "number" },
                        providerPaymentIntentId: { type: "string" },
                        status: { type: "string" },
                        amount: { type: "number" },
                        currency: { type: "string" },
                        financialTermsHash: { type: "string" },
                        occurredAt: { type: "string" },
                        providerChargeId: { type: "string" },
                        providerPaymentAbsent: { type: "boolean" },
                        cancellationRequestId: { type: "string" },
                        providerSnapshot: { type: "object" },
                    },
                    required: ["orderPublicId", "providerEventId", "occurredAt"],
                },
            },
            output: [{ status: "200", body: { type: "object" } }],
        },
        {
            urn: makeEndpointUrn("commerce", "authorizeOrderRelease"),
            method: "POST",
            targetUrl: "https://commerce.test/settlement/authorize",
            input: {
                body: {
                    type: "object",
                    properties: {
                        orderId: { type: "number" },
                        expectedSettlementVersion: { type: "number" },
                        reason: { type: "string" },
                        actorKind: { type: "string" },
                    },
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            status: { type: "string" },
                            releaseAuthorizationId: { type: "string" },
                            orderId: { type: "number" },
                            orderPublicId: { type: "string" },
                            paymentId: { type: "number" },
                            businessKey: { type: "string" },
                            releaseKind: { type: "string" },
                            sellerId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                            sellerRequiredMinimumBalanceAmount: { type: "number" },
                            payoutDelayDays: { type: "number" },
                            amount: { type: "number" },
                            currency: { type: "string" },
                            financialTermsHash: { type: "string" },
                        },
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("commerce", "recordOrderSettlement"),
            method: "POST",
            targetUrl: "https://commerce.test/settlement/record",
            input: {
                body: {
                    type: "object",
                    properties: {
                        orderPublicId: { type: "string" },
                        providerEventId: { type: "string" },
                        operationType: { type: "string" },
                        providerOperationId: { type: "number" },
                        status: { type: "string" },
                        amount: { type: "number" },
                        currency: { type: "string" },
                        occurredAt: { type: "string" },
                        releaseAuthorizationId: { type: "string" },
                        refundRequestId: { type: "string" },
                        providerSnapshot: { type: "object" },
                        commerceRefundRequestId: { type: "number" },
                    },
                    required: [
                        "orderPublicId",
                        "providerEventId",
                        "operationType",
                        "providerOperationId",
                        "status",
                        "amount",
                        "currency",
                        "occurredAt",
                    ],
                },
            },
            output: [{ status: "200", body: { type: "object" } }],
        },
        {
            urn: makeEndpointUrn("commerce", "getPaymentOrderContext"),
            method: "GET",
            access: { mode: "system" },
            targetUrl: "https://commerce.test/system/order/payment-context",
            headers: [
                {
                    name: "x-cms-user-id",
                    source: { from: "computed", ref: "userID" },
                },
            ],
            input: {
                params: [
                    {
                        name: "orderId",
                        in: "query",
                        required: true,
                        schema: { type: "number" },
                    },
                ],
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            publicId: { type: "string" },
                            buyerCmsUserId: { type: "string" },
                        },
                        required: ["id", "publicId", "buyerCmsUserId"],
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("commerce", "myOrder"),
            method: "GET",
            targetUrl: "https://commerce.test/order",
            input: { params: [{ name: "id", in: "query", schema: { type: "string" } }] },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            publicId: { type: "string" },
                            orderNumber: { type: "string" },
                            sellerId: { type: "number", semantic: { kind: "user-id", authority: "commerce" } },
                            buyerCmsUserId: { type: "string" },
                            subtotalAmount: { type: "number" },
                            totalAmount: { type: "number" },
                            currency: { type: "string" },
                        },
                    },
                },
            ],
        },
    ];
}
