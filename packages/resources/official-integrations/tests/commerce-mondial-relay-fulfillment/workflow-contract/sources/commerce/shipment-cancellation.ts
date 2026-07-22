import type { SourceEndpoint } from "@bernouy/cms-sources";
import { array, boolean, endpoint, fulfillmentAddressShape, number, object, string } from "../builders";

export const commerceShipmentCancellationEndpoints: SourceEndpoint[] = [
    endpoint(
        "claimPendingShipmentCancellations",
        "POST",
        "/claimShipmentCancellations",
        object({
            items: array({
                operationId: number(),
                claimToken: string(),
                orderPublicId: string(),
                trackingUntil: string(),
            }),
        }),
        undefined,
        { runKey: string(), limit: number() },
        "system",
    ),
    endpoint(
        "completeOrderShipmentCancellation",
        "POST",
        "/completeShipmentCancellation",
        object({
            operationId: number(),
            status: string(),
        }),
        undefined,
        {
            operationId: number(),
            claimToken: string(),
            providerStatus: string(),
            providerReference: string(),
            providerSnapshot: object({
                id: string(),
                externalOrderId: string(),
                expeditionNumber: string(),
                status: string(),
            }),
        },
        "system",
    ),
    endpoint(
        "failOrderShipmentCancellation",
        "POST",
        "/failShipmentCancellation",
        object({
            operationId: number(),
            status: string(),
        }),
        undefined,
        { operationId: number(), claimToken: string(), error: string() },
        "system",
    ),
];
