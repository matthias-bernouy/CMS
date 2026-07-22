import type { SourceEndpoint } from "@bernouy/cms-sources";
import { array, boolean, endpoint, fulfillmentAddressShape, number, object, string } from "../builders";

export const deliveryReconciliationEndpoints: SourceEndpoint[] = [
    endpoint(
        "reconcileShipments",
        "POST",
        "/reconcileShipments",
        object({
            processed: number(),
            shipments: array({ id: string(), status: string() }),
            events: array({
                eventId: number(),
                claimToken: string(),
                projectionAttempts: number(),
                orderPublicId: string(),
                providerEventId: string(),
                normalizedStatus: string(),
                occurredAt: string(),
                providerReference: string(),
                carrierAcceptedAt: string(),
                recipientHandoffAt: string(),
            }),
            claimReturnEvents: array({
                eventId: number(),
                claimToken: string(),
                projectionAttempts: number(),
                claimId: number(),
                externalOrderId: string(),
                providerEventId: string(),
                normalizedStatus: string(),
                occurredAt: string(),
                providerReference: string(),
                providerEvidence: object({ provider: string(), providerStatus: string() }),
            }),
        }),
        undefined,
        { runKey: string(), limit: number() },
        "system",
    ),
    endpoint(
        "acknowledgeShipmentEvent",
        "POST",
        "/acknowledgeShipmentEvent",
        object({
            acknowledged: boolean(),
        }),
        undefined,
        { eventId: number(), claimToken: string() },
        "system",
    ),
    endpoint(
        "failShipmentEventProjection",
        "POST",
        "/failShipmentEventProjection",
        object({
            id: number(),
            projectionStatus: string(),
            projectionAttempts: number(),
            projectionNextAttemptAt: string(),
            projectionLastError: string(),
            projectionManualReviewAt: string(),
        }),
        undefined,
        { eventId: number(), claimToken: string(), error: string() },
        "system",
    ),
];
