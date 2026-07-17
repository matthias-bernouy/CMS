import { describe, expect, test } from "bun:test";
import { executeClaimTracking } from "./harness";
import { successfulResponder } from "./responders";

describe("Commerce Mondial Relay claim return tracking call budgets", () => {
    test("authorizes then reads one hydrated return tracking snapshot", async () => {
        const { response, calls } = await executeClaimTracking(
            successfulResponder(),
        );

        expect(response.status).toBe(200);
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/system/claim/return-authorization",
            "/system/shipment-for-external-order",
        ]);
        expect(calls.map(call => call.method)).toEqual([
            "GET",
            "GET",
        ]);
        expect(Object.fromEntries(calls[1]!.url.searchParams)).toEqual({
            externalOrderId: "claim-return:7",
        });
    });

    test("returns after the bounded lookup when no return shipment exists", async () => {
        const { response, calls } = await executeClaimTracking(
            successfulResponder({ empty: true }),
        );

        expect(response.status).toBe(200);
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/system/claim/return-authorization",
            "/system/shipment-for-external-order",
        ]);
    });
});
