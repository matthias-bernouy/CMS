import type { CmsFunction } from "@bernouy/cms-functions";
import { makeEndpointUrn, makeSourceUrn, type Source } from "@bernouy/cms-sources";

export function versionedFunction(): CmsFunction {
    return {
        id: "resolveVersionedProvider",
        method: "POST",
        steps: [{ id: "resolved", call: { source: "versioned", endpoint: "resolve", body: { value: "payload" } } }],
        return: { body: "$steps.resolved" },
    };
}

export function versionedSource(host: string): Source {
    return {
        urn: makeSourceUrn("versioned"),
        endpoints: [
            {
                urn: makeEndpointUrn("versioned", "resolve"),
                method: "POST",
                targetUrl: `https://${host}/resolve`,
                headers: [
                    { name: "authorization", source: { from: "secret", ref: "PROVIDER_KEY", prefix: "Bearer " } },
                    { name: "x-user-id", source: { from: "computed", ref: "userID" } },
                    { name: "x-user-role", source: { from: "computed", ref: "userRole" } },
                ],
                input: {
                    body: {
                        type: "object",
                        properties: { value: { type: "string" } },
                        required: ["value"],
                    },
                },
                output: [{ status: "200", body: observedProviderShape() }],
            },
        ],
    };
}

export function identityFunction(): CmsFunction {
    return {
        id: "createPaymentForOrder",
        method: "POST",
        steps: [
            { id: "order", call: { source: "commerce", endpoint: "getOrder" } },
            {
                id: "payment",
                call: {
                    source: "stripe-connect",
                    endpoint: "createPayment",
                    body: {
                        sellerId: "$steps.order.sellerId",
                        reviewerSellerId: "$steps.order.sellerId",
                        amount: "$steps.order.amount",
                    },
                },
            },
        ],
        return: { body: "$steps.payment" },
    };
}

export function commerceSource(): Source {
    return {
        urn: makeSourceUrn("commerce"),
        identityAuthority: "commerce",
        endpoints: [
            {
                urn: makeEndpointUrn("commerce", "getOrder"),
                method: "GET",
                targetUrl: "https://commerce.test/order",
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: {
                                sellerId: {
                                    type: "number",
                                    semantic: { kind: "user-id", authority: "commerce" },
                                },
                                amount: { type: "number" },
                            },
                            required: ["sellerId", "amount"],
                        },
                    },
                ],
            },
        ],
    };
}

export function stripeSource(): Source {
    return {
        urn: makeSourceUrn("stripe-connect"),
        identityAuthority: "stripe-connect",
        endpoints: [
            {
                urn: makeEndpointUrn("stripe-connect", "createPayment"),
                method: "POST",
                targetUrl: "https://stripe.test/payment",
                input: {
                    body: {
                        type: "object",
                        properties: {
                            sellerId: {
                                type: "string",
                                semantic: { kind: "user-id", authority: "stripe-connect" },
                            },
                            reviewerSellerId: {
                                type: "string",
                                semantic: { kind: "user-id", authority: "stripe-connect" },
                            },
                            amount: { type: "number" },
                        },
                        required: ["sellerId", "reviewerSellerId", "amount"],
                    },
                },
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: {
                                paymentId: { type: "string" },
                                status: { type: "string" },
                            },
                            required: ["paymentId", "status"],
                        },
                    },
                ],
            },
        ],
    };
}

export function functionRequest(): Request {
    return new Request("https://cms.test/function", { method: "POST" });
}

function observedProviderShape() {
    return {
        type: "object" as const,
        properties: {
            provider: { type: "string" as const },
            userId: { type: "string" as const },
            userRole: { type: "string" as const },
            value: { type: "string" as const },
        },
        required: ["provider", "userId", "userRole", "value"],
    };
}
