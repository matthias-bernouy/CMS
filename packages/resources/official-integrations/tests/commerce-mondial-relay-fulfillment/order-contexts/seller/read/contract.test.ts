import { describe, expect, test } from "bun:test";
import { shipment } from "../../shared/fixtures";
import { loadFulfillmentFunction } from "../../shared/harness";
import {
    orderPublicId,
    sellerId,
    sellerTrackingResponse,
} from "../shared/fixtures";
import {
    executeSellerFunction,
    sellerGetRequest,
} from "../shared/harness";
import { sellerResponder } from "../shared/responders";

const functionId = "getShipmentForMySale";

describe("seller shipment read contract", () => {
    test("keeps the exact null-aware seller projection and call budget", async () => {
        const { response, calls } = await executeRead();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(sellerTrackingResponse);
        expect(Object.keys(body)).toEqual([
            "orderId", "orderPublicId", "orderNumber", "shipments",
        ]);
        expect(Object.keys(body.shipments[0])).toEqual([
            "id", "expeditionNumber", "status", "trackingUrl",
            "deliveryRelayLocation", "latestEventLabel", "latestEventAt",
            "carrierAcceptedAt", "sellerHandoffDeclaredAt",
            "recipientHandoffAt", "createdAt", "events",
        ]);
        expect(Object.keys(body.shipments[0].events[0])).toEqual([
            "eventLabel", "eventDate", "eventTime", "normalizedStatus",
            "occurredAt", "location",
        ]);
        expect(calls.map(call => [
            call.method,
            call.url.pathname,
            Object.fromEntries(call.url.searchParams),
            call.userId,
        ])).toEqual([
            ["GET", "/mySale", { id: "42" }, sellerId],
            ["GET", "/shipmentForExternalOrder", {
                externalOrderId: orderPublicId,
            }, null],
        ]);
        expect(calls.every(call => call.body === undefined)).toBe(true);
    });

    test("does not return private Commerce or Delivery fields", async () => {
        const { response } = await executeRead();
        const serialized = JSON.stringify(await response.json());

        for (const value of [
            "Private Buyer", "7 Private Street", "private-financial-hash",
            "buyer@example.test", "private-provider-event",
            "private-provider-value",
        ]) expect(serialized).not.toContain(value);
    });

    test("keeps an absent shipment as a successful empty array", async () => {
        const { response, calls } = await executeRead(
            sellerResponder({ shipments: { items: [] } }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            orderId: 42,
            orderPublicId,
            orderNumber: "CO-42",
            shipments: [],
        });
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/mySale", "/shipmentForExternalOrder",
        ]);
    });

    test("preserves nulls while omitting absent optional shipment fields", async () => {
        const changed = {
            ...shipment,
            trackingUrl: undefined,
            latestEventAt: undefined,
            sellerHandoffDeclaredAt: undefined,
        };
        const { response } = await executeRead(
            sellerResponder({ shipments: { items: [changed] } }),
        );

        expect(response.status).toBe(200);
        const detail = (await response.json()).shipments[0];
        expect(Object.hasOwn(detail, "trackingUrl")).toBe(false);
        expect(Object.hasOwn(detail, "latestEventAt")).toBe(false);
        expect(Object.hasOwn(detail, "sellerHandoffDeclaredAt")).toBe(false);
        expect(detail.expeditionNumber).toBeNull();
        expect(detail.recipientHandoffAt).toBeNull();
    });

    test("performs fresh Commerce and Delivery work on every execution", async () => {
        const first = await executeRead();
        const second = await executeRead();

        expect(first.response.status).toBe(200);
        expect(second.response.status).toBe(200);
        for (const calls of [first.calls, second.calls]) {
            expect(calls.map(call => call.url.pathname)).toEqual([
                "/mySale", "/shipmentForExternalOrder",
            ]);
        }
    });

    test("keeps the declared authenticated GET boundary", async () => {
        const fn = await loadFulfillmentFunction(functionId);
        expect({ method: fn.method, access: fn.access }).toEqual({
            method: "GET",
            access: { mode: "auth" },
        });
    });
});

function executeRead(responder = sellerResponder()) {
    return executeSellerFunction(
        functionId,
        sellerGetRequest(functionId, "42"),
        responder,
    );
}
