import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";

export function commerceCheckoutEndpoints(): Source["endpoints"] {
    return [
        {
            urn: makeEndpointUrn("commerce", "getProtectedCheckoutSellerContext"),
            method: "POST",
            access: { mode: "system" },
            targetUrl: "https://commerce.test/protected-checkout/seller-context",
            headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                body: {
                    type: "object",
                    properties: {
                        items: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    offerId: { type: "string" },
                                    quantity: { type: "number" },
                                },
                                required: ["offerId", "quantity"],
                            },
                        },
                    },
                    required: ["items"],
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            sellerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                            buyerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                        },
                        required: ["sellerCmsUserId", "buyerCmsUserId"],
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("commerce", "getProtectedPaymentSellerContext"),
            method: "POST",
            access: { mode: "system" },
            targetUrl: "https://commerce.test/protected-payment/seller-context",
            headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                body: {
                    type: "object",
                    properties: {
                        orderId: { type: "number" },
                    },
                    required: ["orderId"],
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            sellerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                            buyerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                        },
                        required: ["sellerCmsUserId", "buyerCmsUserId"],
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("commerce", "createOrder"),
            method: "POST",
            targetUrl: "https://commerce.test/order/create",
            headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                body: {
                    type: "object",
                    properties: {
                        idempotencyKey: { type: "string" },
                        items: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    offerId: { type: "string" },
                                    quantity: { type: "number" },
                                },
                                required: ["offerId", "quantity"],
                            },
                        },
                        shippingAddress: { type: "object" },
                        billingAddress: { type: "object" },
                        metadata: { type: "object" },
                    },
                    required: ["idempotencyKey", "items"],
                },
            },
            output: [
                {
                    status: "201",
                    body: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            publicId: { type: "string" },
                            status: { type: "string" },
                            currency: { type: "string" },
                            subtotalAmount: { type: "number" },
                            totalAmount: { type: "number" },
                        },
                        required: ["id", "publicId", "status", "currency", "subtotalAmount", "totalAmount"],
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("commerce", "prepareProtectedPayment"),
            method: "POST",
            access: { mode: "system" },
            targetUrl: "https://commerce.test/payment/prepare",
            headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                body: {
                    type: "object",
                    properties: { orderId: { type: "number" } },
                    required: ["orderId"],
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            orderId: { type: "number" },
                            orderPublicId: { type: "string" },
                            orderNumber: { type: "string" },
                            sellerId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                            buyerTotalAmount: { type: "number" },
                            sellerProceedsAmount: { type: "number" },
                            sellerTransferReleaseAmount: { type: "number" },
                            sellerReserveLiabilityAmount: { type: "number" },
                            currency: { type: "string" },
                            financialTermsHash: { type: "string" },
                            financialRevision: { type: "number" },
                            protectionRequired: { type: "boolean" },
                            payoutDelayDays: { type: "number" },
                            sellerRequiredMinimumBalanceAmount: { type: "number" },
                            platformRequiredMinimumBalanceAmount: { type: "number" },
                            dualApprovalThresholdAmount: { type: "number" },
                            platformLiabilityRevision: { type: "number" },
                            platformPayoutDecreaseAuthorizationId: { type: "string", nullable: true },
                            platformPayoutChangeDirection: { type: "string" },
                            sellerReserveLiabilityDays: { type: "number" },
                        },
                    },
                },
            ],
        },
    ];
}
