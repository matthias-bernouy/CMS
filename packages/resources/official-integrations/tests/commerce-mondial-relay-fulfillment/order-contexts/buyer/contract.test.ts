import { describe, expect, test } from "bun:test";
import {
    buyerId,
    buyerTrackingResponse,
    orderPublicId,
    shipment,
} from "../shared/fixtures";
import {
    executeBuyerTracking,
    loadBuyerTrackingFunction,
} from "../shared/harness";
import { successfulBuyerResponder } from "../shared/responders";

describe("buyer shipment context contract", () => {
    test("keeps the exact null-aware public projection and call budget", async () => {
        const { response, calls } = await executeBuyerTracking(
            successfulBuyerResponder(),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(buyerTrackingResponse);
        expect(Object.keys(body)).toEqual([
            "orderId",
            "orderPublicId",
            "shipments",
        ]);
        expect(Object.keys(body.shipments[0])).toEqual([
            "id",
            "expeditionNumber",
            "status",
            "trackingUrl",
            "deliveryRelayLocation",
            "latestEventLabel",
            "latestEventAt",
            "carrierAcceptedAt",
            "recipientHandoffAt",
            "createdAt",
            "events",
        ]);
        expect(JSON.stringify(body)).not.toContain(
            shipment.sellerHandoffDeclaredAt,
        );
        expect(JSON.stringify(body)).not.toContain("Private");
        expect(JSON.stringify(body)).not.toContain("buyer@example.test");
        expect(JSON.stringify(body)).not.toContain("provider");
        expect(calls.map(call => [
            call.method,
            call.url.pathname,
            Object.fromEntries(call.url.searchParams),
            call.userId,
        ])).toEqual([
            [
                "GET",
                "/system/order/payment-context",
                { orderId: "42" },
                buyerId,
            ],
            [
                "GET",
                "/shipmentForExternalOrder",
                { externalOrderId: orderPublicId },
                null,
            ],
        ]);
        expect(calls.every(call => call.body === undefined)).toBe(true);
    });

    test("keeps empty tracking as a successful empty array", async () => {
        const { response, calls } = await executeBuyerTracking(
            successfulBuyerResponder({ items: [] }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            orderId: 42,
            orderPublicId,
            shipments: [],
        });
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/system/order/payment-context",
            "/shipmentForExternalOrder",
        ]);
    });

    test("keeps absent optional shipment fields omitted", async () => {
        const { response } = await executeBuyerTracking(
            successfulBuyerResponder({
                shipment: {
                    trackingUrl: undefined,
                    latestEventAt: undefined,
                },
            }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(Object.hasOwn(body.shipments[0], "trackingUrl")).toBe(false);
        expect(Object.hasOwn(body.shipments[0], "latestEventAt")).toBe(false);
        expect(body.shipments[0].recipientHandoffAt).toBeNull();
    });

    test("performs fresh Commerce and Delivery work on every execution", async () => {
        const first = await executeBuyerTracking(successfulBuyerResponder());
        const second = await executeBuyerTracking(successfulBuyerResponder());

        expect(first.response.status).toBe(200);
        expect(second.response.status).toBe(200);
        expect(first.calls.map(call => call.url.pathname)).toEqual([
            "/system/order/payment-context",
            "/shipmentForExternalOrder",
        ]);
        expect(second.calls.map(call => call.url.pathname)).toEqual([
            "/system/order/payment-context",
            "/shipmentForExternalOrder",
        ]);
    });

    test("keeps the declared authenticated GET boundary", async () => {
        const fn = await loadBuyerTrackingFunction();
        expect({ method: fn.method, access: fn.access }).toEqual({
            method: "GET",
            access: { mode: "auth" },
        });
    });
});
