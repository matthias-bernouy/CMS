import { makeEndpointUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import {
    boolean,
    computedUserHeader,
    number,
    object,
    text,
} from "../../shared/shapes";

export function sellerCommerceEndpoints(): SourceEndpoint[] {
    return [mySale(), labelAuthorization(), recordFulfillment()];
}

function mySale(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "mySale"),
        method: "GET",
        access: { mode: "auth" },
        targetUrl: "https://commerce.test/mySale",
        headers: computedUserHeader(),
        input: {
            params: [
                { name: "id", in: "query", schema: text() },
                { name: "publicId", in: "query", schema: text() },
            ],
        },
        output: [{
            status: "200",
            body: object({
                id: number(),
                publicId: text(),
                orderNumber: text(),
                shippingAddress: object(),
                metadata: object(),
                lines: { type: "array", items: object() },
                financialTerms: object(),
            }),
        }],
    };
}

function labelAuthorization(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "getOrderLabelAuthorization"),
        method: "GET",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/labelAuthorization",
        headers: computedUserHeader(),
        input: {
            params: [{
                name: "orderPublicId",
                in: "query",
                required: true,
                schema: text(),
            }],
        },
        output: [{
            status: "200",
            body: object({
                allowed: boolean(),
                orderId: number(),
                orderPublicId: text(),
                sellerCmsUserId: text(),
                fulfillmentStatus: text(),
                providerReference: text(true),
            }, [
                "allowed",
                "orderId",
                "orderPublicId",
                "sellerCmsUserId",
                "fulfillmentStatus",
            ]),
        }],
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
            body: object({
                orderPublicId: text(),
                providerEventId: text(),
                normalizedStatus: text(),
                occurredAt: text(),
                providerReference: text(),
                sellerHandoffDeclaredAt: text(),
            }, [
                "orderPublicId",
                "providerEventId",
                "normalizedStatus",
                "occurredAt",
            ]),
        },
        output: [{
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
        }],
    };
}
