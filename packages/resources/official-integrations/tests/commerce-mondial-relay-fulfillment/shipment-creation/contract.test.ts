import { describe, expect, test } from "bun:test";
import { loadFulfillmentFunction } from "../order-contexts/shared/harness";
import { orderPublicId, reservation, sellerId } from "./fixtures/context";
import { expectedQuoteRequest, expectedShipmentRequest, replayShipment } from "./fixtures/delivery";
import { creationResult, expectedCompletionRequest, replayFulfillment } from "./fixtures/result";
import { executeShipmentCreation, functionId } from "./harness";
import { creationResponder } from "./responders";

describe("seller shipment creation contract", () => {
    test("preserves the exact success response within five causal boundaries", async () => {
        const { response, calls } = await executeShipmentCreation(creationResponder());

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(creationResult);
        expect(Object.keys(body)).toEqual(["orderId", "orderPublicId", "shipment", "fulfillment"]);
        expect(Object.keys(body.shipment)).toEqual([
            "ok",
            "id",
            "expeditionNumber",
            "trackingUrl",
            "status",
            "createdAt",
        ]);
        expect(Object.keys(body.fulfillment)).toEqual([
            "id",
            "orderId",
            "businessKey",
            "deliveryQuoteId",
            "financialTermsHash",
            "status",
            "attempts",
            "providerReference",
            "providerShipmentId",
            "lastError",
            "createdAt",
            "updatedAt",
            "idempotentReplay",
            "fulfillment",
        ]);
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain("7 Private Street");
        expect(serialized).not.toContain("private@example.test");
        expect(serialized).not.toContain("+336");
        expect(serialized).not.toContain("claimToken");
        expect(serialized).not.toContain("labelUrl");

        expect(
            calls.map((call) => ({
                method: call.method,
                path: call.url.pathname,
                params: Object.fromEntries(call.url.searchParams),
                body: call.body,
                userId: call.userId,
            })),
        ).toEqual(expectedCalls());
    });

    test("preserves real replay fields and completion omission", async () => {
        const { response, calls } = await executeShipmentCreation(
            creationResponder({
                shipment: Response.json(replayShipment),
                fulfillment: replayFulfillment,
            }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            orderId: 42,
            orderPublicId,
            shipment: replayShipment,
            fulfillment: replayFulfillment,
        });
        expect(body.shipment.idempotentReplay).toBe(true);
        expect(body.fulfillment.idempotentReplay).toBe(true);
        expect(Object.hasOwn(body.fulfillment, "fulfillment")).toBe(false);
        expect(calls.map((call) => call.url.pathname)).toEqual(expectedPaths());
        expect(calls[4]?.body).toEqual(expectedCompletionRequest());
    });

    test("keeps the authenticated POST boundary", async () => {
        const fn = await loadFulfillmentFunction(functionId);
        expect({ method: fn.method, access: fn.access }).toEqual({
            method: "POST",
            access: { mode: "auth" },
        });
    });
});

function expectedCalls() {
    return [
        {
            method: "GET",
            path: "/shipmentCreationSellerContext",
            params: { orderId: "42" },
            body: undefined,
            userId: sellerId,
        },
        {
            method: "POST",
            path: "/reserveShipmentCreation",
            params: {},
            body: {
                orderPublicId,
                workerId: `seller-request:${sellerId}`,
            },
            userId: sellerId,
        },
        {
            method: "POST",
            path: "/resolveDeliveryQuote",
            params: {},
            body: expectedQuoteRequest(),
            userId: null,
        },
        {
            method: "POST",
            path: "/createShipment",
            params: {},
            body: expectedShipmentRequest(),
            userId: sellerId,
        },
        {
            method: "POST",
            path: "/completeShipmentCreation",
            params: {},
            body: expectedCompletionRequest(),
            userId: null,
        },
    ];
}

export function expectedPaths() {
    return [
        "/shipmentCreationSellerContext",
        "/reserveShipmentCreation",
        "/resolveDeliveryQuote",
        "/createShipment",
        "/completeShipmentCreation",
    ];
}
