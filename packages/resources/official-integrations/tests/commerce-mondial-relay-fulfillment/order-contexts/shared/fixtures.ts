export const buyerId = "buyer-subject";
export const orderPublicId = "00000000-0000-4000-8000-000000000042";

export const buyerOrder = {
    id: 42,
    publicId: orderPublicId,
    buyerCmsUserId: buyerId,
    shippingAddress: {
        recipient: "Private Buyer",
        addressLine1: "7 Private Street",
    },
    billingAddress: { addressLine1: "8 Private Street" },
    metadata: { privateNote: "must not cross the workflow" },
    lines: [{ title: "must not cross the workflow" }],
    financialTerms: { financialTermsHash: "private-financial-hash" },
};

export const shipment = {
    id: "shipment-42",
    expeditionNumber: null,
    status: "available_for_pickup",
    trackingUrl: null,
    deliveryRelayLocation: null,
    latestEventLabel: null,
    latestEventAt: null,
    carrierAcceptedAt: null,
    sellerHandoffDeclaredAt: "2026-07-13T07:30:00.000Z",
    recipientHandoffAt: null,
    createdAt: "2026-07-12T09:00:00.000Z",
    events: [{
        eventLabel: "Disponible au Point Relais",
        eventDate: null,
        eventTime: null,
        normalizedStatus: "available_for_pickup",
        occurredAt: "2026-07-14T11:00:00.000Z",
        location: null,
        providerEventKey: "private-provider-event",
        rawPayload: { recipientEmail: "buyer@example.test" },
    }],
    recipientName: "Private Buyer",
    recipientEmail: "buyer@example.test",
    recipientPhone: "+33600000000",
    rawResponse: { providerSecret: "private-provider-value" },
};

export const buyerTrackingResponse = {
    orderId: 42,
    orderPublicId,
    shipments: [{
        id: shipment.id,
        expeditionNumber: null,
        status: shipment.status,
        trackingUrl: null,
        deliveryRelayLocation: null,
        latestEventLabel: null,
        latestEventAt: null,
        carrierAcceptedAt: null,
        recipientHandoffAt: null,
        createdAt: shipment.createdAt,
        events: [{
            eventLabel: "Disponible au Point Relais",
            eventDate: null,
            eventTime: null,
            normalizedStatus: "available_for_pickup",
            occurredAt: "2026-07-14T11:00:00.000Z",
            location: null,
        }],
    }],
};
