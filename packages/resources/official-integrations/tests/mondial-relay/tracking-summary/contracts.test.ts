import { describe, expect, test } from "bun:test";
import { expectedEvents, trackingLink } from "./fixtures";
import { useTrackingDatabase } from "./harness";

describe("Mondial Relay tracking summary contracts", () => {
    test("returns the exact found DTO with nulls and ordered public events", async () => {
        const database = await useTrackingDatabase();

        const response = await database.request();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            carrier: "mondial-relay",
            expeditionNumber: "00435394",
            postalCode: "76930",
            url: trackingLink,
            tracking: {
                expeditionNumber: "00435394",
                status: "in_transit",
                latestEventLabel: "",
                latestEventAt: "",
                events: expectedEvents,
            },
        });
        expect(Object.keys(body.tracking)).toEqual([
            "expeditionNumber",
            "status",
            "latestEventLabel",
            "latestEventAt",
            "events",
        ]);
        expect(Object.keys(body.tracking.events[0])).toEqual([
            "normalizedStatus",
            "occurredAt",
            "eventLabel",
            "eventDate",
            "eventTime",
            "location",
        ]);
        expect(JSON.stringify(body)).not.toContain("Private Recipient");
        expect(JSON.stringify(body)).not.toContain("private@example.test");
        expect(database.reads).toEqual(["shipment", "events"]);
        expect(database.calls.map((call) => [call.method, call.pathname])).toEqual([
            ["POST", "/rest/v1/rpc/read_tracking_summary"],
        ]);
        expect(database.calls[0]?.body).toEqual({
            p_expedition_number: "00435394",
        });
    });

    test("returns the exact missing DTO without reading events", async () => {
        const database = await useTrackingDatabase({ shipment: null });
        const missingLink = "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=87654321";

        const response = await database.request(missingLink);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            carrier: "mondial-relay",
            expeditionNumber: "87654321",
            postalCode: "",
            url: missingLink,
            tracking: {
                expeditionNumber: "87654321",
                status: "unknown",
                events: [],
            },
        });
        expect(database.reads).toEqual(["shipment"]);
        expect(database.eventReadCount()).toBe(0);
        expect(database.calls.map((call) => [call.method, call.pathname])).toEqual([
            ["POST", "/rest/v1/rpc/read_tracking_summary"],
        ]);
        expect(database.calls[0]?.body).toEqual({ p_expedition_number: "87654321" });
    });
});
