import { describe, expect, test } from "bun:test";
import { claimTrackingRequest, executeClaimTracking, loadClaimTrackingFunction } from "./harness";
import { failingResponder, successfulResponder } from "./responders";

describe("Commerce Mondial Relay claim return tracking boundaries", () => {
    test("keeps authenticated access and validates selectors before source work", async () => {
        const fn = await loadClaimTrackingFunction();
        expect({ method: fn.method, access: fn.access }).toEqual({
            method: "GET",
            access: { mode: "auth" },
        });
        const missing = await executeClaimTracking(successfulResponder(), {
            request: new Request("https://cms.test/functions/getClaimReturnForMe"),
        });
        const invalid = await executeClaimTracking(successfulResponder(), { request: claimTrackingRequest("invalid") });

        await expectGenericFailure(missing.response);
        expect(missing.calls).toEqual([]);
        expect([invalid.response.status, await invalid.response.json(), invalid.calls]).toEqual([
            400,
            { error: "params.claimId must be a number" },
            [],
        ]);

        const decimal = await executeClaimTracking(successfulResponder(), { request: claimTrackingRequest(7.5) });
        await expectGenericFailure(decimal.response);
        expect(decimal.calls.map((call) => call.url.pathname)).toEqual(["/system/claim/return-authorization"]);
    });

    test("refuses a missing subject after the bounded authorization lookup", async () => {
        const { response, calls } = await executeClaimTracking(successfulResponder(), { user: null });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: "Marketplace claim return does not belong to the current user",
        });
        expect(calls.map((call) => call.url.pathname)).toEqual(["/system/claim/return-authorization"]);
    });

    test("rejects another member after authorization and before Delivery", async () => {
        const { response, calls } = await executeClaimTracking(successfulResponder(), {
            user: { id: "other-user", role: "user" },
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: "Marketplace claim return does not belong to the current user",
        });
        expect(calls.map((call) => call.url.pathname)).toEqual(["/system/claim/return-authorization"]);
    });

    for (const [point, paths] of [
        ["authorization", ["/system/claim/return-authorization"]],
        ["delivery", ["/system/claim/return-authorization", "/system/shipment-for-external-order"]],
        ["hydration", ["/system/claim/return-authorization", "/system/shipment-for-external-order"]],
    ] as const) {
        test(`normalizes ${point} failure without leaking upstream data`, async () => {
            const { response, calls } = await executeClaimTracking(failingResponder(point));

            await expectGenericFailure(response);
            expect(calls.map((call) => call.url.pathname)).toEqual(paths);
        });
    }

    test("preserves the legacy refusal of an explicit null relay location", async () => {
        const { response } = await executeClaimTracking(
            successfulResponder({
                shipment: { deliveryRelayLocation: null },
            }),
        );

        await expectGenericFailure(response);
    });
});

async function expectGenericFailure(response: Response): Promise<void> {
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
        error: "Function execution failed",
        correlationId: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain("Private Street");
    expect(JSON.stringify(body)).not.toContain("provider");
}
