import { describe, expect, test } from "bun:test";
import { expeditionNumber, oldEvent, publicEvent, shipmentRow } from "./fixtures";
import { useClaimReturnDatabase } from "./harness";

describe("Mondial Relay legacy claim return tracking contracts", () => {
    test("returns the exact shipment and tracking DTOs with nulls and ordered events", async () => {
        const database = await useClaimReturnDatabase();

        const result = await database.requestLegacy();
        const shipment = await result.shipment.json();
        const tracking = await result.tracking!.json();

        expect([result.shipment.status, result.tracking!.status]).toEqual([200, 200]);
        expect(shipment).toEqual({
            ...camelize(shipmentRow),
            deliveryRelayLocation: "FR-024474",
            events: [publicEvent(oldEvent)],
        });
        expect(tracking).toEqual({
            expeditionNumber,
            status: "carrier_accepted",
            latestEventLabel: "Colis pris en charge",
            latestEventAt: "2026-07-12T09:00:00.000Z",
            carrierAcceptedAt: "2026-07-12T09:00:00.000Z",
            recipientHandoffAt: "",
            events: [publicEvent(oldEvent)],
        });
        expect(Object.keys(tracking.events[0])).toEqual([
            "normalizedStatus",
            "occurredAt",
            "eventLabel",
            "eventDate",
            "eventTime",
            "location",
        ]);
    });

    test("uses three local reads when no provider refresh is due", async () => {
        const database = await useClaimReturnDatabase();

        await database.requestLegacy();

        expect(database.calls.map(({ method, pathname }) => [method, pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
            ["GET", "/rest/v1/shipments"],
            ["GET", "/rest/v1/shipment_events"],
        ]);
    });
});

function camelize(row: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
            key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()),
            value,
        ]),
    );
}
