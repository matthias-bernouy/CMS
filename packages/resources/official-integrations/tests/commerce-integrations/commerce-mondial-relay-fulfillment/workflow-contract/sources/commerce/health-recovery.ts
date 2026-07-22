import type { SourceEndpoint } from "@bernouy/cms-sources";
import { array, boolean, endpoint, fulfillmentAddressShape, number, object, string } from "../builders";

export const commerceHealthRecoveryEndpoints: SourceEndpoint[] = [
    endpoint(
        "recordDeliveryReconciliationHealth",
        "POST",
        "/recordDeliveryReconciliationHealth",
        object({
            runKey: string(),
            checkedAt: string(),
            pendingProjectionCount: number(),
            manualReviewCount: number(),
            trackingErrorCount: number(),
        }),
        undefined,
        {
            runKey: string(),
            checkedAt: string(),
            pendingProjectionCount: number(),
            manualReviewCount: number(),
            trackingErrorCount: number(),
        },
        "system",
    ),
    endpoint(
        "recordDeliveryOrderReconciliationHealth",
        "POST",
        "/recordDeliveryOrderReconciliationHealth",
        object({
            orderPublicId: string(),
            checkedAt: string(),
            pendingProjectionCount: number(),
            manualReviewCount: number(),
            trackingErrorCount: number(),
        }),
        undefined,
        {
            runKey: string(),
            checkedAt: string(),
            orderPublicId: string(),
            shipmentId: string(),
            providerReference: string(),
            shipmentStatus: string(),
            pendingProjectionCount: number(),
            manualReviewCount: number(),
            trackingErrorCount: number(),
            trackingCheckedAt: string(),
        },
        "system",
    ),
    endpoint(
        "recoverOrderShipmentCreation",
        "POST",
        "/recoverOrderShipmentCreation",
        object({
            status: string(),
            providerReference: string(),
        }),
        undefined,
        {
            orderPublicId: string(),
            providerReference: string(),
            providerShipmentId: string(),
            reason: string(),
            providerSnapshot: object({
                id: string(),
                externalOrderId: string(),
                expeditionNumber: string(),
                status: string(),
            }),
        },
        "admin",
    ),
];
