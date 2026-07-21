import { makeEndpointUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import { boolean, computedUserHeader, number, object, text } from "../../order-contexts/shared/shapes";

export function creationCommerceEndpoints(): SourceEndpoint[] {
    return [shipmentCreationContext(), reserve(), complete()];
}

function shipmentCreationContext(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "getOrderShipmentCreationSellerContext"),
        method: "GET",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/shipmentCreationSellerContext",
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
                        allowed: boolean(),
                        sellerId: text(),
                    },
                    ["id", "publicId", "allowed", "sellerId"],
                ),
            },
        ],
    };
}

function reserve(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "reserveOrderShipmentCreation"),
        method: "POST",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/reserveShipmentCreation",
        headers: computedUserHeader(),
        input: {
            body: object(
                {
                    orderPublicId: text(),
                    workerId: text(),
                },
                ["orderPublicId"],
            ),
        },
        output: [
            {
                status: "200",
                body: object(
                    {
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
                    },
                    [
                        "operationId",
                        "claimToken",
                        "orderPublicId",
                        "sellerId",
                        "buyerCmsUserId",
                        "deliveryQuoteId",
                        "merchandiseSubtotalMinorAmount",
                        "currency",
                        "financialTermsHash",
                    ],
                ),
            },
            errorOutput("409"),
        ],
    };
}

function complete(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "completeOrderShipmentCreation"),
        method: "POST",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/completeShipmentCreation",
        input: {
            body: object(
                {
                    operationId: number(),
                    claimToken: text(),
                    providerReference: text(),
                    providerShipmentId: text(),
                    providerSnapshot: object(),
                },
                ["operationId", "claimToken", "providerReference"],
            ),
        },
        output: [
            {
                status: "200",
                body: object(
                    {
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
                    },
                    ["id", "orderId", "businessKey", "status", "attempts"],
                ),
            },
        ],
    };
}

function errorOutput(status: string) {
    return {
        status,
        body: object({ error: text() }, ["error"]),
    };
}
