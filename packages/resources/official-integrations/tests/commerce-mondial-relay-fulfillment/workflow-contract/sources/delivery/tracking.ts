import type { SourceEndpoint } from "@bernouy/cms-sources";
import { array, boolean, endpoint, fulfillmentAddressShape, number, object, string } from "../builders";

export const deliveryTrackingEndpoints: SourceEndpoint[] = [
    endpoint(
        "tracking",
        "GET",
        "/tracking",
        object({
            expeditionNumber: string(),
            status: string(),
            carrierAcceptedAt: string(),
            recipientHandoffAt: string(),
            events: array({
                providerEventKey: string(),
                normalizedStatus: string(),
                occurredAt: string(),
                eventLabel: string(),
                eventDate: string(),
                eventTime: string(),
                location: string(),
            }),
        }),
        { expeditionNumber: string() },
        undefined,
        "system",
    ),
    endpoint(
        "shipmentTrackingContext",
        "GET",
        "/shipmentTrackingContext",
        object({
            shipment: object({
                id: string(),
                externalOrderId: string(),
                expeditionNumber: string(),
                status: string(),
                recipientHandoffAt: string(),
            }),
            tracking: object({
                expeditionNumber: string(),
                status: string(),
                carrierAcceptedAt: string(),
                recipientHandoffAt: string(),
                events: array({
                    providerEventKey: string(),
                    normalizedStatus: string(),
                    occurredAt: string(),
                    eventLabel: string(),
                    eventDate: string(),
                    eventTime: string(),
                    location: string(),
                }),
            }),
        }),
        { expeditionNumber: string(), expectedExternalOrderId: string() },
        undefined,
        "system",
    ),
    endpoint(
        "issueLabelAccess",
        "POST",
        "/issueLabelAccess",
        object({
            token: string(),
            expiresAt: string(),
        }),
        undefined,
        { externalOrderId: string(), sellerCmsUserId: string() },
        "system",
        ["201"],
    ),
    endpoint(
        "declareSellerHandoff",
        "POST",
        "/declareSellerHandoff",
        object({
            id: string(),
            externalOrderId: string(),
            expeditionNumber: string(),
            status: string(),
            sellerHandoffDeclaredAt: string(),
        }),
        undefined,
        { externalOrderId: string() },
        "system",
    ),
];
