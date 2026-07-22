import { describe, expect, test } from "bun:test";
import { freshEvent, oldEvent, publicEvent } from "./fixtures";
import { useClaimReturnDatabase } from "./harness";

describe("Mondial Relay shipment tracking context", () => {
    test("builds both legacy DTOs from one coherent local read", async () => {
        const database = await useClaimReturnDatabase();

        const response = await database.requestContext();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.shipment.status).toBe("carrier_accepted");
        expect(body.shipment.recipientHandoffAt).toBeNull();
        expect(body.shipment.events).toEqual([publicEvent(oldEvent)]);
        expect(body.tracking).toEqual({
            expeditionNumber: "87654321",
            status: "carrier_accepted",
            latestEventLabel: "Colis pris en charge",
            latestEventAt: "2026-07-12T09:00:00.000Z",
            carrierAcceptedAt: "2026-07-12T09:00:00.000Z",
            recipientHandoffAt: "",
            events: [publicEvent(oldEvent)],
        });
        expect(database.calls.map(({ method, pathname }) => [method, pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
        ]);
    });

    test("enforces the expected external order before any refresh side effect", async () => {
        const database = await useClaimReturnDatabase({ refreshDue: true, externalOrderId: "claim-return:8" });

        const response = await database.requestContext("claim-return:7");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.shipment.externalOrderId).toBe("claim-return:8");
        expect(body.tracking.status).toBe("carrier_accepted");
        expect(database.calls.map(({ method, pathname }) => [method, pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
        ]);
    });

    test("keeps the legacy shipment snapshot and freshly rereads events after provider refresh", async () => {
        const database = await useClaimReturnDatabase({ refreshDue: true });

        const response = await database.requestContext();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.shipment.status).toBe("carrier_accepted");
        expect(body.shipment.events).toEqual([publicEvent(oldEvent)]);
        expect(body.tracking.status).toBe("collected_by_recipient");
        expect(body.tracking.events[0]).toEqual(publicEvent(freshEvent));
        expect(database.calls.map(({ method, pathname }) => [method, pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
            ["POST", "/WebService.asmx"],
            ["POST", "/rest/v1/shipment_events"],
            ["PATCH", "/rest/v1/shipments"],
            ["GET", "/rest/v1/shipment_events"],
        ]);
    });

    test("preserves provider failure precedence without a DB write", async () => {
        const database = await useClaimReturnDatabase({ refreshDue: true, providerFailure: true });

        const response = await database.requestContext();

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
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
            ["POST", "/WebService.asmx"],
        ]);
    });

    test("authenticates and validates both bounded identifiers before reading", async () => {
        const database = await useClaimReturnDatabase();

        const unauthorized = await database.requestContext("claim-return:7", "Bearer wrong-key");
        const missingExpected = await database.request("/system/shipment-tracking-context", {
            expeditionNumber: "87654321",
        });
        const missingExpedition = await database.request("/system/shipment-tracking-context", {
            expectedExternalOrderId: "claim-return:7",
        });

        expect([unauthorized.status, missingExpected.status, missingExpedition.status]).toEqual([401, 400, 400]);
        expect(await unauthorized.json()).toEqual({ error: "unauthorized" });
        expect(await missingExpected.json()).toEqual({ error: "expectedExternalOrderId is required" });
        expect(await missingExpedition.json()).toEqual({ error: "expeditionNumber is required" });
        expect(database.calls).toEqual([]);
    });

    test("preserves the missing shipment error after one bounded read", async () => {
        const database = await useClaimReturnDatabase({ missing: true });

        const response = await database.requestContext();

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "shipment not found" });
        expect(database.calls.map(({ method, pathname }) => [method, pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
        ]);
    });
});
