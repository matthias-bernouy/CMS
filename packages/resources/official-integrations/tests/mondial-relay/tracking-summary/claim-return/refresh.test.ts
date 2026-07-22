import { describe, expect, test } from "bun:test";
import { freshEvent, oldEvent, publicEvent } from "./fixtures";
import { useClaimReturnDatabase } from "./harness";

describe("Mondial Relay legacy claim return tracking refresh", () => {
    test("keeps the shipment snapshot and observes provider events after refresh", async () => {
        const database = await useClaimReturnDatabase({ refreshDue: true });

        const result = await database.requestLegacy();
        const shipment = await result.shipment.json();
        const tracking = await result.tracking!.json();

        expect([result.shipment.status, result.tracking!.status]).toEqual([200, 200]);
        expect(shipment.status).toBe("carrier_accepted");
        expect(shipment.recipientHandoffAt).toBeNull();
        expect(shipment.events).toEqual([publicEvent(oldEvent)]);
        expect(tracking.status).toBe("collected_by_recipient");
        expect(tracking.recipientHandoffAt).toBe("2026-07-13T12:30:00.000Z");
        expect(tracking.events[0]).toEqual(publicEvent(freshEvent));
        expect(database.calls.map(({ method, pathname }) => [method, pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
            ["GET", "/rest/v1/shipments"],
            ["POST", "/WebService.asmx"],
            ["POST", "/rest/v1/shipment_events"],
            ["PATCH", "/rest/v1/shipments"],
            ["GET", "/rest/v1/shipment_events"],
        ]);
    });

    test("propagates the provider failure before any write or event reread", async () => {
        const database = await useClaimReturnDatabase({ refreshDue: true, providerFailure: true });

        const result = await database.requestLegacy();

        expect(result.shipment.status).toBe(200);
        expect(result.tracking!.status).toBe(502);
        expect(await result.tracking!.json()).toEqual({
            error: "Mondial Relay tracking returned HTTP 503",
            mondialRelay: {
                operation: "WSI2_TracingColisDetaille",
                endpoint: "https://api.mondialrelay.com/WebService.asmx",
                statusCode: "",
                retrySafe: false,
            },
        });
        expect(database.calls.map(({ method, pathname }) => [method, pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
            ["GET", "/rest/v1/shipments"],
            ["POST", "/WebService.asmx"],
        ]);
    });
});
