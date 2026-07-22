export type JsonRecord = Record<string, unknown>;

export const expeditionNumber = "87654321";
export const expectedExternalOrderId = "claim-return:7";

export const oldEvent: JsonRecord = {
    normalized_status: "carrier_accepted",
    occurred_at: "2026-07-12T09:00:00.000Z",
    event_label: "Colis pris en charge",
    event_date: "2026-07-12",
    event_time: null,
    location: null,
    created_at: "2026-07-12T09:01:00.000Z",
};

export const freshEvent: JsonRecord = {
    normalized_status: "collected_by_recipient",
    occurred_at: "2026-07-13T12:30:00.000Z",
    event_label: "Colis livré au destinataire",
    event_date: "2026-07-13",
    event_time: "14:30",
    location: "LYON",
    created_at: "2026-07-13T14:31:00.000Z",
};

export const shipmentRow: JsonRecord = {
    id: "return-shipment-7",
    external_order_id: expectedExternalOrderId,
    expedition_number: expeditionNumber,
    status: "carrier_accepted",
    last_error: null,
    tracking_url: null,
    delivery_relay_number: "FR-024474",
    latest_event_label: "Colis pris en charge",
    latest_event_at: "2026-07-12T09:00:00.000Z",
    carrier_accepted_at: "2026-07-12T09:00:00.000Z",
    seller_handoff_declared_at: null,
    recipient_handoff_at: null,
    tracking_checked_at: new Date(Date.now() - 60_000).toISOString(),
    created_at: "2026-07-11T08:00:00.000Z",
};

export const providerXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope><soap:Body><WSI2_TracingColisDetailleResponse>
<STAT>80</STAT><Libelle01>Colis livré au destinataire</Libelle01>
<Tracing><Libelle>Colis livré au destinataire</Libelle><Date>13/07/2026</Date><Heure>14:30</Heure><Emplacement>LYON</Emplacement></Tracing>
</WSI2_TracingColisDetailleResponse></soap:Body></soap:Envelope>`;

export function publicEvent(row: JsonRecord) {
    return {
        normalizedStatus: row.normalized_status,
        occurredAt: row.occurred_at,
        eventLabel: row.event_label,
        eventDate: row.event_date,
        eventTime: row.event_time,
        location: row.location,
    };
}
