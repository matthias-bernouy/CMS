export const events = [
    {
        normalizedStatus: "collected_by_recipient",
        occurredAt: "2026-07-13T14:30:00.000Z",
        eventLabel: "Colis livré",
        eventDate: "2026-07-13",
        eventTime: "14:30",
        location: "LYON",
    },
    {
        normalizedStatus: "carrier_accepted",
        occurredAt: "2026-07-12T09:00:00.000Z",
        eventLabel: "Colis pris en charge",
        eventDate: "2026-07-12",
        eventTime: null,
        location: null,
    },
];

export const shipment = {
    id: "return-shipment-7",
    externalOrderId: "claim-return:7",
    expeditionNumber: "87654321",
    status: "collected_by_recipient",
    createdAt: "2026-07-11T08:00:00.000Z",
    lastError: null,
    trackingUrl: null,
    deliveryRelayLocation: "FR-024474",
    latestEventLabel: "Colis livré",
    latestEventAt: "2026-07-13T14:30:00.000Z",
    carrierAcceptedAt: "2026-07-12T09:00:00.000Z",
    sellerHandoffDeclaredAt: null,
    recipientHandoffAt: "2026-07-13T14:30:00.000Z",
    events,
};

export const tracking = {
    expeditionNumber: "87654321",
    status: "collected_by_recipient",
    latestEventLabel: "Colis livré",
    latestEventAt: "2026-07-13T14:30:00.000Z",
    carrierAcceptedAt: "2026-07-12T09:00:00.000Z",
    recipientHandoffAt: "2026-07-13T14:30:00.000Z",
    events,
};

export const claims = {
    carrier: { id: 7, status: "return_required", returnDeliveryStatus: "carrier_accepted" },
    handoff: { id: 7, status: "resolved", returnDeliveryStatus: "recipient_handoff" },
};

export type EventKind = "carrier" | "handoff";

export function commerceBody(kind: EventKind) {
    const milestone = kind === "carrier" ? "carrier_accepted" : "recipient_handoff";
    const occurredAt = kind === "carrier" ? tracking.carrierAcceptedAt : tracking.recipientHandoffAt;
    return {
        claimId: 7,
        providerEventId: `mondial-relay-return|87654321|${milestone}|${occurredAt}`,
        providerReference: "87654321",
        normalizedStatus: milestone,
        occurredAt,
        providerEvidence: {
            provider: "mondial-relay",
            shipmentId: shipment.id,
            providerStatus: tracking.status,
        },
    };
}
