import { describe, expect, test } from "bun:test";
import { executeClaimReturnEvent, successfulResponder } from "./harness";

describe("Commerce Mondial Relay claim return event call budgets", () => {
    test("checks shipment binding before tracking and Commerce", async () => {
        const { response, calls } = await executeClaimReturnEvent("carrier", successfulResponder("carrier"));

        expect(response.status).toBe(200);
        expect(calls.map(({ method, url }) => [method, url.pathname])).toEqual([
            ["GET", "/shipmentTrackingContext"],
            ["POST", "/recordClaimReturnDelivery"],
        ]);
        expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({
            expeditionNumber: "87654321",
            expectedExternalOrderId: "claim-return:7",
        });
    });

    test("stops after one Delivery call when the shipment binding differs", async () => {
        const { response, calls } = await executeClaimReturnEvent(
            "handoff",
            successfulResponder("handoff", { shipment: { externalOrderId: "claim-return:8" } }),
        );

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "Shipment is not bound to this marketplace claim return" });
        expect(calls.map(({ url }) => url.pathname)).toEqual(["/shipmentTrackingContext"]);
    });
});
