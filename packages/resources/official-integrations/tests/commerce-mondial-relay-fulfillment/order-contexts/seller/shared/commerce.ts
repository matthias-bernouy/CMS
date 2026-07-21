import { makeEndpointUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import { boolean, computedUserHeader, number, object, text } from "../../shared/shapes";

export function sellerCommerceEndpoints(): SourceEndpoint[] {
    return [sellerContext(), labelSellerContext(), recordFulfillment()];
}

function sellerContext(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "getOrderFulfillmentSellerContext"),
        method: "GET",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/sellerContext",
        headers: computedUserHeader(),
        input: {
            params: [{ name: "orderId", in: "query", schema: text() }],
        },
        output: [
            {
                status: "200",
                body: object({
                    id: number(),
                    publicId: text(),
                    orderNumber: text(),
                }),
            },
        ],
    };
}

function labelSellerContext(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "getOrderLabelSellerContext"),
        method: "GET",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/labelSellerContext",
        headers: computedUserHeader(),
        input: {
            params: [
                {
                    name: "orderId",
                    in: "query",
                    schema: text(),
                },
            ],
        },
        output: [
            {
                status: "200",
                body: object(
                    {
                        publicId: text(),
                        allowed: boolean(),
                        sellerCmsUserId: text(),
                    },
                    ["publicId", "allowed", "sellerCmsUserId"],
                ),
            },
        ],
    };
}

function recordFulfillment(): SourceEndpoint {
    const nullableText = text(true);
    return {
        urn: makeEndpointUrn("commerce", "recordOrderFulfillment"),
        method: "POST",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/recordFulfillment",
        input: {
            body: object(
                {
                    orderPublicId: text(),
                    providerEventId: text(),
                    normalizedStatus: text(),
                    occurredAt: text(),
                    providerReference: text(),
                    sellerHandoffDeclaredAt: text(),
                },
                ["orderPublicId", "providerEventId", "normalizedStatus", "occurredAt"],
            ),
        },
        output: [
            {
                status: "200",
                body: object({
                    orderId: number(),
                    orderPublicId: text(),
                    status: text(),
                    providerReference: nullableText,
                    carrierAcceptedAt: nullableText,
                    sellerHandoffDeclaredAt: nullableText,
                    recipientHandoffAt: nullableText,
                    recipientHandoffFirstObservedAt: nullableText,
                    claimWindowStartedAt: nullableText,
                    claimByAt: nullableText,
                    releaseEligibleAt: nullableText,
                    blockingReason: nullableText,
                    version: number(),
                }),
            },
        ],
    };
}
