import { makeEndpointUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import { boolean, computedUserHeader, number, object, text } from "../../shared/shapes";

export function sellerCommerceEndpoints(): SourceEndpoint[] {
    return [shippingActionsContext(), recordFulfillment()];
}

function shippingActionsContext(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "getOrderShippingActionsSellerContext"),
        method: "GET",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/shippingActions",
        headers: computedUserHeader(),
        input: {
            params: [{ name: "orderId", in: "query", schema: text() }],
        },
        output: [
            {
                status: "200",
                body: object(
                    {
                        id: number(),
                        publicId: text(),
                        orderNumber: text(),
                        sellerCmsUserId: text(),
                        orderStatus: text(),
                        fulfillmentStatus: text(),
                        settlementStatus: text(),
                        blockingReason: text(true),
                        reviewReason: text(true),
                        canCreateShipment: boolean(),
                        canDownloadLabel: boolean(),
                        canDeclareHandoff: boolean(),
                        requiresReview: boolean(),
                    },
                    [
                        "id",
                        "publicId",
                        "orderNumber",
                        "sellerCmsUserId",
                        "orderStatus",
                        "fulfillmentStatus",
                        "settlementStatus",
                        "canCreateShipment",
                        "canDownloadLabel",
                        "canDeclareHandoff",
                        "requiresReview",
                    ],
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
