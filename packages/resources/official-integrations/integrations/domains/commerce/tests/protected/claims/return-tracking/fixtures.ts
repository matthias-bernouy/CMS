export const authorization = {
    allowed: true,
    reason: "authorized",
    claimId: 7,
    claimPublicId: "claim-public-7",
    claimStatus: "return_required",
    claimVersion: 3,
    returnShipByAt: "2026-07-20T09:00:00.000Z",
    returnDeliveryStatus: "in_transit",
    orderId: 42,
    orderPublicId: "order-public-42",
    orderNumber: "CO-42",
    buyerCmsUserId: "buyer-user",
    sellerId: 12,
    sellerCmsUserId: "seller-user",
    deliveryQuoteId: "quote-42",
    merchandiseSubtotalMinorAmount: 11_000,
    currency: "EUR",
};

export const events = [
    {
        providerEventKey: "private-provider-event-2",
        normalizedStatus: "in_transit",
        occurredAt: "2026-07-15T10:00:00.000Z",
        eventLabel: "Parcel in transit",
        eventDate: "2026-07-15",
        eventTime: "10:00",
        location: "Lyon",
    },
    {
        providerEventKey: "private-provider-event-1",
        normalizedStatus: null,
        occurredAt: null,
        eventLabel: "Label created",
        eventDate: null,
        eventTime: null,
        location: null,
    },
];

export const shipment = {
    id: "return-shipment-7",
    externalOrderId: "claim-return:7",
    expeditionNumber: "87654321",
    status: "in_transit",
    trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=87654321",
    deliveryRelayLocation: "FR-024474",
    latestEventLabel: "Parcel in transit",
    latestEventAt: "2026-07-15T10:00:00.000Z",
    carrierAcceptedAt: "2026-07-14T09:00:00.000Z",
    sellerHandoffDeclaredAt: "2026-07-13T08:00:00.000Z",
    recipientHandoffAt: null,
    createdAt: "2026-07-13T07:00:00.000Z",
    events,
    labelUrl: "https://private.example/label.pdf",
    recipientName: "Private recipient",
    recipientEmail: "private@example.test",
    recipientPhone: "+33600000000",
    recipientAddressLine1: "7 Private Street",
    recipientPostalCode: "75001",
    recipientCity: "Paris",
    lastError: "private provider detail",
};

export const publicEvents = events.map(({ providerEventKey: _providerEventKey, ...event }) => event);

export const publicShipment = {
    id: shipment.id,
    expeditionNumber: shipment.expeditionNumber,
    status: shipment.status,
    trackingUrl: shipment.trackingUrl,
    deliveryRelayLocation: shipment.deliveryRelayLocation,
    latestEventLabel: shipment.latestEventLabel,
    latestEventAt: shipment.latestEventAt,
    carrierAcceptedAt: shipment.carrierAcceptedAt,
    recipientHandoffAt: shipment.recipientHandoffAt,
    createdAt: shipment.createdAt,
    events: publicEvents,
};

export const publicResponse = {
    claimId: authorization.claimId,
    claimStatus: authorization.claimStatus,
    returnShipByAt: authorization.returnShipByAt,
    returnDeliveryStatus: authorization.returnDeliveryStatus,
    orderNumber: authorization.orderNumber,
    allowed: authorization.allowed,
    reason: authorization.reason,
    shipments: [publicShipment],
};
