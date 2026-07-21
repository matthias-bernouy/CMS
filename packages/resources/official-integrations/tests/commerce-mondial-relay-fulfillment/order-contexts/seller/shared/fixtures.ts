import {
    orderPublicId,
    shipment,
} from "../../shared/fixtures";

export const sellerId = "seller-subject";
export { orderPublicId };

export const sellerSale = {
    id: 42,
    publicId: orderPublicId,
    orderNumber: "CO-42",
    shippingAddress: {
        recipient: "Private Buyer",
        addressLine1: "7 Private Street",
    },
    metadata: { privateNote: "must not cross the workflow" },
    lines: [{ title: "must not cross the workflow" }],
    financialTerms: { financialTermsHash: "private-financial-hash" },
};

export const sellerTrackingResponse = {
    orderId: sellerSale.id,
    orderPublicId,
    orderNumber: sellerSale.orderNumber,
    shipments: [{
        id: shipment.id,
        expeditionNumber: shipment.expeditionNumber,
        status: shipment.status,
        trackingUrl: shipment.trackingUrl,
        deliveryRelayLocation: shipment.deliveryRelayLocation,
        latestEventLabel: shipment.latestEventLabel,
        latestEventAt: shipment.latestEventAt,
        carrierAcceptedAt: shipment.carrierAcceptedAt,
        sellerHandoffDeclaredAt: shipment.sellerHandoffDeclaredAt,
        recipientHandoffAt: shipment.recipientHandoffAt,
        createdAt: shipment.createdAt,
        events: [{
            eventLabel: shipment.events[0]!.eventLabel,
            eventDate: shipment.events[0]!.eventDate,
            eventTime: shipment.events[0]!.eventTime,
            normalizedStatus: shipment.events[0]!.normalizedStatus,
            occurredAt: shipment.events[0]!.occurredAt,
            location: shipment.events[0]!.location,
        }],
    }],
};

export const labelAuthorization = {
    allowed: true,
    orderId: sellerSale.id,
    orderPublicId,
    sellerCmsUserId: sellerId,
    fulfillmentStatus: "label_created",
    providerReference: "12345678",
};

export const labelCapability = {
    token: "seller-bound-label-token",
    expiresAt: "2026-07-21T08:10:00.000Z",
};

export const handoff = {
    id: shipment.id,
    externalOrderId: orderPublicId,
    expeditionNumber: "12345678",
    status: "label_ready",
    sellerHandoffDeclaredAt: "2026-07-21T08:00:00.000Z",
};

export const fulfillment = {
    orderId: sellerSale.id,
    orderPublicId,
    status: "seller_handoff_declared",
    providerReference: handoff.expeditionNumber,
    carrierAcceptedAt: null,
    sellerHandoffDeclaredAt: handoff.sellerHandoffDeclaredAt,
    recipientHandoffAt: null,
    recipientHandoffFirstObservedAt: null,
    claimWindowStartedAt: null,
    claimByAt: null,
    releaseEligibleAt: null,
    blockingReason: null,
    version: 2,
};

export const replayFulfillment = {
    ...fulfillment,
    orderPublicId: undefined,
};
