import { describe, expect, test } from "bun:test";
import { executeClaimTracking } from "./harness";
import { successfulResponder } from "./responders";

describe("Commerce Mondial Relay claim return tracking call budgets", () => {
    test("authorizes, lists one shipment, then hydrates its tracking", async () => {
        const { response, calls } = await executeClaimTracking(
            successfulResponder(),
        );

        expect(response.status).toBe(200);
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/system/claim/return-authorization",
            "/shipments",
            "/shipment",
        ]);
        expect(calls.map(call => call.method)).toEqual([
            "GET",
            "GET",
            "GET",
        ]);
        expect(Object.fromEntries(calls[1]!.url.searchParams)).toEqual({
            externalOrderId: "claim-return:7",
            limit: "1",
            offset: "0",
        });
        expect(Object.fromEntries(calls[2]!.url.searchParams)).toEqual({
            id: "return-shipment-7",
        });
    });

    test("stops after the list when no return shipment exists", async () => {
        const { response, calls } = await executeClaimTracking(
            successfulResponder({ empty: true }),
        );

        expect(response.status).toBe(200);
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/system/claim/return-authorization",
            "/shipments",
        ]);
    });
});
