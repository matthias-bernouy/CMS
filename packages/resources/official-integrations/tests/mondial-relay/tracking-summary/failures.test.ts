import { describe, expect, test } from "bun:test";
import { useTrackingDatabase } from "./harness";

describe("Mondial Relay tracking summary failures", () => {
    test("propagates the first database failure without reading events", async () => {
        const database = await useTrackingDatabase({ failure: "shipment" });

        const response = await database.request();

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Supabase Data API request failed (503)" });
        expect(database.reads).toEqual(["shipment"]);
        expect(database.eventReadCount()).toBe(0);
        expect(database.calls).toHaveLength(1);
    });

    test("propagates the second database failure after the shipment read", async () => {
        const database = await useTrackingDatabase({ failure: "events" });

        const response = await database.request();

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Supabase Data API request failed (503)" });
        expect(database.reads).toEqual(["shipment", "events"]);
        expect(database.calls.map((call) => call.pathname)).toEqual(["/rest/v1/shipments", "/rest/v1/shipment_events"]);
    });

    test("fails closed when the future tracking RPC returns malformed events", async () => {
        const database = await useTrackingDatabase({ malformedEvents: true });
        const originalConsoleError = console.error;
        console.error = () => undefined;
        try {
            const response = await database.request();
            const body = await response.json();

            expect(response.status).toBeGreaterThanOrEqual(500);
            expect(Object.keys(body)).toEqual(["error"]);
            expect(body).not.toHaveProperty("tracking");
            expect(JSON.stringify(body)).not.toContain("private");
            expect(database.reads).toEqual(["shipment", "events"]);
        } finally {
            console.error = originalConsoleError;
        }
    });
});
