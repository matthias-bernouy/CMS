import { describe, expect, test } from "bun:test";
import { concurrentEvent } from "./fixtures";
import { useTrackingDatabase } from "./harness";

describe("Mondial Relay tracking summary freshness", () => {
    test("observes an event committed between the shipment and event reads", async () => {
        const database = await useTrackingDatabase();
        const eventPause = database.pauseEvents();
        const pending = database.request();

        await eventPause.entered;
        database.events.push(concurrentEvent);
        eventPause.resume();
        const response = await pending;
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.tracking.events[0]).toEqual({
            normalizedStatus: "available_for_pickup",
            occurredAt: "2026-07-21T12:00:00.000Z",
            eventLabel: "Disponible au Point Relais",
            eventDate: "2026-07-21",
            eventTime: "12:00",
            location: "LE HAVRE",
        });
        expect(database.reads).toEqual(["shipment", "events"]);
        expect(database.calls.map((call) => [call.method, call.pathname])).toEqual([
            ["POST", "/rest/v1/rpc/read_tracking_summary"],
        ]);
    });
});
