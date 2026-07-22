import { describe, expect, test } from "bun:test";
import { checkoutBody, expectedCheckout } from "./fixtures.ts";
import { callSaveRoute } from "./harness.ts";

describe("Mondial Relay checkout selection setup", () => {
    test("requires the CMS bearer and buyer before reading or calling the provider", async () => {
        const cases = [
            [{ authorization: null }, { error: "unauthorized" }],
            [{ authorization: "Bearer wrong" }, { error: "unauthorized" }],
            [{ userId: null }, { error: "CMS user is missing" }],
            [{ userId: "   " }, { error: "CMS user is missing" }],
        ] as const;
        for (const [options, expected] of cases) {
            const result = await callSaveRoute(options);
            expect(result.response.status).toBe(401);
            expect(await result.response.json()).toEqual(expected);
            expect(result.requests).toEqual([]);
        }
    });

    test("validates the request key and order id before the shipment read", async () => {
        for (const [body, error] of [
            [{}, "requestKey is required"],
            [{ requestKey: "request" }, "externalOrderId is required"],
        ] as const) {
            const result = await callSaveRoute({ body });
            expect(result.response.status).toBe(400);
            expect(await result.response.json()).toEqual({ error });
            expect(result.logicalSteps).toEqual([]);
        }
    });

    test("an existing shipment wins before the remaining payload validation", async () => {
        const result = await callSaveRoute({
            shipmentExists: true,
            body: { requestKey: "request", externalOrderId: "already-started" },
        });

        expect(result.response.status).toBe(409);
        expect(await result.response.json()).toEqual({
            error: "relay selection cannot change after shipment creation has started",
        });
        expect(result.logicalSteps).toEqual(["shipment"]);
        expect(result.providerRequests).toEqual([]);
    });

    test("buyer validation fails after shipment but before settings", async () => {
        const result = await callSaveRoute({ body: checkoutBody({ selectedForCmsUserId: "another-buyer" }) });

        expect(result.response.status).toBe(403);
        expect(await result.response.json()).toEqual({ error: "delivery quote belongs to another buyer" });
        expect(result.logicalSteps).toEqual(["shipment"]);
    });

    test("relay format and country validation retain their post-settings order", async () => {
        const malformed = await callSaveRoute({ body: checkoutBody({ relayLocation: "bad" }) });
        expect(malformed.response.status).toBe(400);
        expect(await malformed.response.json()).toEqual({ error: "pickup point identifier is invalid" });
        expect(malformed.logicalSteps).toEqual(["shipment", "settings"]);

        const foreign = await callSaveRoute({ body: checkoutBody({ country: "BE" }) });
        expect(foreign.response.status).toBe(400);
        expect(await foreign.response.json()).toEqual({ error: "only French pickup points are supported" });
        expect(foreign.logicalSteps).toEqual(["shipment", "settings"]);
    });

    test("returns the current DTO and keeps setup, provider, then quote write order", async () => {
        const result = await callSaveRoute();

        expect(result.response.status).toBe(200);
        expect(await result.response.json()).toEqual(expectedCheckout);
        expect(result.logicalSteps).toEqual(["shipment", "settings", "provider", "write"]);
        expect(result.databaseRequests.map(({ method, pathname }) => [method, pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
            ["GET", "/rest/v1/settings"],
            ["POST", "/rest/v1/rpc/reserve_delivery_quote"],
        ]);
        const lookup = new URLSearchParams(result.providerRequests[0]?.search);
        expect(lookup.get("Weight")).toBe("750");
        expect(result.databaseRequests[2]?.body).toMatchObject({
            p_weight_grams: 750,
            p_shipping_amount: 625,
            p_currency: "eur",
        });
    });

    test("null settings preserve the default quote values", async () => {
        const result = await callSaveRoute({ settings: null });

        expect(result.response.status).toBe(200);
        expect(await result.response.json()).toMatchObject({ weightGrams: 500, shippingAmount: 450, currency: "eur" });
        expect(new URLSearchParams(result.providerRequests[0]?.search).get("Weight")).toBe("500");
    });

    test.todo("future budget: setup RPC plus quote write uses exactly two database requests");
});
