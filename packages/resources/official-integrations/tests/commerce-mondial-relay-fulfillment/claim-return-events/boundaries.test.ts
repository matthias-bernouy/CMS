import { describe, expect, test } from "bun:test";
import { eventRequest, executeClaimReturnEvent, loadFunction, successfulResponder } from "./harness";

describe("Commerce Mondial Relay claim return event boundaries", () => {
    test("keeps both projection functions system-only", async () => {
        expect((await loadFunction("carrier")).access).toEqual({ mode: "system" });
        expect((await loadFunction("handoff")).access).toEqual({ mode: "system" });
    });

    for (const [kind, field, message] of [
        ["carrier", "carrierAcceptedAt", "Return has no trusted carrier acceptance yet"],
        ["handoff", "recipientHandoffAt", "Return has not been handed to the seller by the carrier"],
    ] as const) {
        test(`rejects ${kind} when its trusted provider milestone is null`, async () => {
            const { response, calls } = await executeClaimReturnEvent(
                kind,
                successfulResponder(kind, { tracking: { [field]: null } }),
            );

            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({ error: message });
            expect(calls.map(({ url }) => url.pathname)).toEqual(["/shipmentTrackingContext"]);
        });
    }

    test("preserves required input validation before every source call", async () => {
        for (const body of [{ expeditionNumber: "87654321" }, { claimId: 7 }, { claimId: "7", expeditionNumber: 8 }]) {
            const { response, calls } = await executeClaimReturnEvent("carrier", successfulResponder("carrier"), {
                request: eventRequest("carrier", body),
            });

            expect(response.status).toBe(400);
            expect((await response.json()).error).toBeString();
            expect(calls).toEqual([]);
        }
    });

    test("does not call Commerce after a Delivery tracking failure", async () => {
        const { response, calls } = await executeClaimReturnEvent("carrier", (request) => {
            return Response.json({ error: "private provider failure" }, { status: 502 });
        });

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: "Function execution failed",
            correlationId: expect.any(String),
        });
        expect(calls.map(({ url }) => url.pathname)).toEqual(["/shipmentTrackingContext"]);
    });

    test("does not attempt tracking after a missing shipment", async () => {
        const { response, calls } = await executeClaimReturnEvent("handoff", () =>
            Response.json({ error: "shipment not found" }, { status: 404 }),
        );

        expect(response.status).toBe(502);
        expect(calls.map(({ url }) => url.pathname)).toEqual(["/shipmentTrackingContext"]);
        expect(JSON.stringify(await response.json())).not.toContain("shipment not found");
    });
});
