import type { SourceEndpoint } from "@bernouy/cms-sources";
import { array, boolean, endpoint, fulfillmentAddressShape, number, object, string } from "../builders";

export const commerceShipmentCreationEndpoints: SourceEndpoint[] = [
    endpoint(
        "completeOrderShipmentCreation",
        "POST",
        "/completeShipmentCreation",
        object({
            orderId: number(),
            orderPublicId: string(),
            status: string(),
            providerReference: string(),
            version: number(),
        }),
        undefined,
        {
            operationId: number(),
            claimToken: string(),
            providerReference: string(),
            providerShipmentId: string(),
            providerSnapshot: object({ status: string(), createdAt: string() }),
        },
        "system",
    ),
    endpoint(
        "claimPendingShipmentCreations",
        "POST",
        "/claimShipmentCreations",
        object({
            items: array({
                operationId: number(),
                claimToken: string(),
                orderPublicId: string(),
                sellerId: { type: "string", semantic: "user-id" },
                buyerCmsUserId: string(),
                deliveryQuoteId: string(),
                merchandiseSubtotalMinorAmount: number(),
                currency: string(),
                financialTermsHash: string(),
            }),
        }),
        undefined,
        { runKey: string(), limit: number() },
        "system",
    ),
    endpoint(
        "failOrderShipmentCreation",
        "POST",
        "/failShipmentCreation",
        object({
            operationId: number(),
            status: string(),
        }),
        undefined,
        { operationId: number(), claimToken: string(), error: string() },
        "system",
    ),
];
