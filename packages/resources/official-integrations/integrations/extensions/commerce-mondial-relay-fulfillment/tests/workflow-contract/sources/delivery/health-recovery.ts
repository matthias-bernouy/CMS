import type { SourceEndpoint } from "@bernouy/cms-sources";
import { array, boolean, endpoint, fulfillmentAddressShape, number, object, string } from "../builders";

export const deliveryHealthRecoveryEndpoints: SourceEndpoint[] = [
    endpoint(
        "deliveryProjectionHealth",
        "GET",
        "/deliveryProjectionHealth",
        object({
            checkedAt: string(),
            pendingProjectionCount: number(),
            manualReviewCount: number(),
            trackingErrorCount: number(),
            orders: array({
                externalOrderId: string(),
                shipmentId: string(),
                providerReference: string(),
                shipmentStatus: string(),
                pendingProjectionCount: number(),
                manualReviewCount: number(),
                trackingErrorCount: number(),
                trackingCheckedAt: string(),
            }),
        }),
        undefined,
        undefined,
        "system",
    ),
    endpoint(
        "recoverUnknownShipment",
        "POST",
        "/recoverUnknownShipment",
        object({
            id: string(),
            externalOrderId: string(),
            expeditionNumber: string(),
            status: string(),
        }),
        undefined,
        {
            shipmentId: string(),
            externalOrderId: string(),
            expeditionNumber: string(),
            labelUrl: string(),
            reason: string(),
        },
        "admin",
    ),
    endpoint(
        "cancelShipmentReservation",
        "POST",
        "/cancelShipmentReservation",
        object({
            id: string(),
            externalOrderId: string(),
            expeditionNumber: string(),
            status: string(),
        }),
        undefined,
        { externalOrderId: string(), trackingUntil: string() },
        "system",
    ),
];
