import { makeEndpointUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import {
    array,
    boolean,
    computedUserHeader,
    number,
    object,
    text,
} from "../../order-contexts/shared/shapes";

export function creationCommerceEndpoints(): SourceEndpoint[] {
    return [mySale(), authorization(), reserve(), complete()];
}

function mySale(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "mySale"),
        method: "GET",
        access: { mode: "auth" },
        targetUrl: "https://commerce.test/mySale",
        headers: computedUserHeader(),
        input: {
            params: [{ name: "id", in: "query", schema: text() }],
        },
        output: [{
            status: "200",
            body: object({
                id: number(),
                publicId: text(),
                orderNumber: text(),
                metadata: object({ buyerAddress: text() }),
                lines: array(object({ title: text() })),
                financialTerms: object({ financialTermsHash: text() }),
            }),
        }],
    };
}

function authorization(): SourceEndpoint {
    return {
        urn: makeEndpointUrn(
            "commerce",
            "getOrderFulfillmentAuthorization",
        ),
        method: "GET",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/fulfillmentAuthorization",
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
            body: authorizationShape(),
        }],
    };
}

function authorizationShape() {
    const required = [
        "allowed", "orderId", "orderPublicId", "sellerId", "currency",
        "deliveryQuoteId", "merchandiseSubtotalMinorAmount",
        "paymentStatus", "fulfillmentStatus",
    ];
    return object({
        allowed: boolean(),
        reason: text(true),
        orderId: number(),
        orderPublicId: text(),
        sellerId: text(),
        buyerCmsUserId: text(),
        currency: text(),
        deliveryQuoteId: text(),
        merchandiseSubtotalMinorAmount: number(),
        shippingAmount: number(),
        buyerTotalAmount: number(),
        financialTermsHash: text(),
        paymentStatus: text(),
        fulfillmentStatus: text(),
    }, required);
}

function reserve(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "reserveOrderShipmentCreation"),
        method: "POST",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/reserveShipmentCreation",
        headers: computedUserHeader(),
        input: {
            body: object({
                orderPublicId: text(),
                workerId: text(),
            }, ["orderPublicId"]),
        },
        output: [{
            status: "200",
            body: object({
                operationId: number(),
                claimToken: text(),
                businessKey: text(),
                status: text(),
                orderId: number(),
                orderPublicId: text(),
                sellerId: text(),
                buyerCmsUserId: text(),
                deliveryQuoteId: text(),
                merchandiseSubtotalMinorAmount: number(),
                currency: text(),
                financialTermsHash: text(),
                fulfillmentStatus: text(),
            }, [
                "operationId", "claimToken", "orderPublicId", "sellerId",
                "buyerCmsUserId", "deliveryQuoteId",
                "merchandiseSubtotalMinorAmount", "currency",
                "financialTermsHash",
            ]),
        }, errorOutput("409")],
    };
}

function complete(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "completeOrderShipmentCreation"),
        method: "POST",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/completeShipmentCreation",
        input: {
            body: object({
                operationId: number(),
                claimToken: text(),
                providerReference: text(),
                providerShipmentId: text(),
                providerSnapshot: object(),
            }, ["operationId", "claimToken", "providerReference"]),
        },
        output: [{
            status: "200",
            body: object({
                id: number(),
                orderId: number(),
                businessKey: text(),
                deliveryQuoteId: text(),
                financialTermsHash: text(),
                status: text(),
                attempts: number(),
                providerReference: text(true),
                providerShipmentId: text(true),
                lastError: text(true),
                createdAt: text(),
                updatedAt: text(),
                idempotentReplay: boolean(),
                fulfillment: object({
                    status: text(),
                    providerReference: text(true),
                    version: number(),
                    updatedAt: text(),
                }),
            }, ["id", "orderId", "businessKey", "status", "attempts"]),
        }],
    };
}

function errorOutput(status: string) {
    return {
        status,
        body: object({ error: text() }, ["error"]),
    };
}
