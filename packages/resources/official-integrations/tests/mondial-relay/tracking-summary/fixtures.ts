export type JsonRecord = Record<string, unknown>;

export const trackingLink = "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930";

export const shipmentRow: JsonRecord = {
    id: "shipment-tracking-summary",
    expedition_number: "00435394",
    status: "in_transit",
    latest_event_label: null,
    latest_event_at: null,
    recipient_name: "Private Recipient",
    recipient_email: "private@example.test",
};

export const shipmentEvents: JsonRecord[] = [
    {
        normalized_status: "in_transit",
        occurred_at: null,
        event_label: "Date inconnue",
        event_date: null,
        event_time: null,
        location: null,
        created_at: "2026-07-21T13:00:00.000Z",
    },
    {
        normalized_status: "carrier_accepted",
        occurred_at: "2026-07-21T09:00:00.000Z",
        event_label: "Pris en charge",
        event_date: "2026-07-21",
        event_time: "09:00",
        location: "ROUEN",
        created_at: "2026-07-21T09:01:00.000Z",
    },
    {
        normalized_status: "in_transit",
        occurred_at: "2026-07-21T11:00:00.000Z",
        event_label: "En transit",
        event_date: "2026-07-21",
        event_time: "11:00",
        location: "PARIS",
        created_at: "2026-07-21T11:01:00.000Z",
    },
];

export const expectedEvents = [
    {
        normalizedStatus: "in_transit",
        occurredAt: "2026-07-21T11:00:00.000Z",
        eventLabel: "En transit",
        eventDate: "2026-07-21",
        eventTime: "11:00",
        location: "PARIS",
    },
    {
        normalizedStatus: "carrier_accepted",
        occurredAt: "2026-07-21T09:00:00.000Z",
        eventLabel: "Pris en charge",
        eventDate: "2026-07-21",
        eventTime: "09:00",
        location: "ROUEN",
    },
    {
        normalizedStatus: "in_transit",
        occurredAt: null,
        eventLabel: "Date inconnue",
        eventDate: null,
        eventTime: null,
        location: null,
    },
];

export const concurrentEvent: JsonRecord = {
    normalized_status: "available_for_pickup",
    occurred_at: "2026-07-21T12:00:00.000Z",
    event_label: "Disponible au Point Relais",
    event_date: "2026-07-21",
    event_time: "12:00",
    location: "LE HAVRE",
    created_at: "2026-07-21T12:01:00.000Z",
};
