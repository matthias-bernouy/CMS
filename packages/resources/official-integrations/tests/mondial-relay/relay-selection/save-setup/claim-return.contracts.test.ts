import { describe, expect, test } from "bun:test";
import { claimBody, expectedClaim } from "./fixtures.ts";
import { callSaveRoute } from "./harness.ts";

describe("Mondial Relay claim-return selection setup", () => {
    test("keeps authentication and actor checks before every side effect", async () => {
        for (const [options, error] of [
            [{ route: "claim-return" as const, authorization: null }, "unauthorized"],
            [{ route: "claim-return" as const, userId: null }, "CMS user is missing"],
        ] as const) {
            const result = await callSaveRoute(options);
            expect(result.response.status).toBe(401);
            expect(await result.response.json()).toEqual({ error });
            expect(result.requests).toEqual([]);
        }
    });

    test("rejects non-claim orders before reading a shipment", async () => {
        const result = await callSaveRoute({
            route: "claim-return",
            body: claimBody({ externalOrderId: "checkout-order-42" }),
        });

        expect(result.response.status).toBe(400);
        expect(await result.response.json()).toEqual({
            error: "legacy relay selection is restricted to claim returns",
        });
        expect(result.logicalSteps).toEqual([]);
    });

    test("an existing shipment wins before relay payload validation", async () => {
        const result = await callSaveRoute({
            route: "claim-return",
            shipmentExists: true,
            body: { externalOrderId: "claim-return:42" },
        });

        expect(result.response.status).toBe(409);
        expect(await result.response.json()).toEqual({
            error: "relay selection cannot change after shipment creation has started",
        });
        expect(result.logicalSteps).toEqual(["shipment"]);
    });

    test("required relay fields fail after shipment and before settings", async () => {
        const result = await callSaveRoute({
            route: "claim-return",
            body: { externalOrderId: "claim-return:42" },
        });

        expect(result.response.status).toBe(400);
        expect(await result.response.json()).toEqual({ error: "relayLocation is required" });
        expect(result.logicalSteps).toEqual(["shipment"]);
    });

    test("relay format and country validation remain after settings", async () => {
        for (const body of [claimBody({ relayLocation: "bad" }), claimBody({ country: "BE" })]) {
            const result = await callSaveRoute({ route: "claim-return", body });
            expect(result.response.status).toBe(400);
            expect(await result.response.json()).toEqual({ error: "claim return pickup point is invalid" });
            expect(result.logicalSteps).toEqual(["shipment", "settings"]);
        }
    });

    test("returns the current DTO and keeps setup, provider, then upsert order", async () => {
        const result = await callSaveRoute({ route: "claim-return" });

        expect(result.response.status).toBe(200);
        expect(await result.response.json()).toEqual(expectedClaim);
        expect(result.logicalSteps).toEqual(["shipment", "settings", "provider", "write"]);
        expect(result.databaseRequests.map(({ method, pathname }) => [method, pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
            ["GET", "/rest/v1/settings"],
            ["POST", "/rest/v1/relay_selections"],
        ]);
        expect(result.databaseRequests[2]?.body).toMatchObject({
            weight_grams: 750,
            shipping_amount: 625,
            currency: "eur",
        });
    });

    test("null settings preserve the legacy default selection values", async () => {
        const result = await callSaveRoute({ route: "claim-return", settings: null });

        expect(result.response.status).toBe(200);
        expect(await result.response.json()).toMatchObject({ weightGrams: 500, shippingAmount: 450, currency: "eur" });
        expect(new URLSearchParams(result.providerRequests[0]?.search).get("Weight")).toBe("500");
    });

    test.todo("future budget: setup RPC plus selection upsert uses exactly two database requests");
});
