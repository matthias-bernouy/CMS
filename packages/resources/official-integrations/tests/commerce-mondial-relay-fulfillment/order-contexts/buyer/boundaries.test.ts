import { describe, expect, test } from "bun:test";
import { buyerTrackingResponse } from "../shared/fixtures";
import { executeBuyerTracking, expectGenericFailure } from "../shared/harness";
import { successfulBuyerResponder } from "../shared/responders";

describe("buyer shipment context boundaries", () => {
    test("fails before source work when the authenticated subject is missing", async () => {
        const { response, calls } = await executeBuyerTracking(successfulBuyerResponder(), { user: null });

        await expectGenericFailure(response);
        expect(calls).toEqual([]);
    });

    test("keeps the defensive wrong-buyer refusal before Delivery", async () => {
        const { response, calls } = await executeBuyerTracking(successfulBuyerResponder(), {
            user: { id: "another-buyer", role: "user" },
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: "Order does not belong to the current buyer",
        });
        expect(calls.map((call) => call.url.pathname)).toEqual(["/system/order/payment-context"]);
    });

    test("preserves incomplete Commerce context behavior", async () => {
        const missingBuyer = await executeBuyerTracking(
            successfulBuyerResponder({
                order: { buyerCmsUserId: undefined },
            }),
        );
        const missingId = await executeBuyerTracking(successfulBuyerResponder({ order: { id: undefined } }));

        expect(missingBuyer.response.status).toBe(403);
        expect(await missingBuyer.response.json()).toEqual({
            error: "Order does not belong to the current buyer",
        });
        expect(missingBuyer.calls.map((call) => call.url.pathname)).toEqual(["/system/order/payment-context"]);
        expect(missingId.response.status).toBe(200);
        const missingIdBody = await missingId.response.json();
        expect(missingIdBody).toEqual({
            orderPublicId: buyerTrackingResponse.orderPublicId,
            shipments: buyerTrackingResponse.shipments,
        });
        expect(Object.hasOwn(missingIdBody, "orderId")).toBe(false);
    });

    test("forwards optional string selectors and stops on Commerce refusal", async () => {
        for (const suffix of [
            "",
            "?orderId=",
            "?orderId=invalid",
            "?orderId=7.5",
            "?orderId=-1",
            "?orderId=0",
            "?orderId=9007199254740992",
        ]) {
            const request = new Request(`https://cms.test/functions/getShipmentForOrder${suffix}`);
            const { response, calls } = await executeBuyerTracking(successfulBuyerResponder(), { request });

            await expectGenericFailure(response);
            expect(calls.map((call) => call.url.pathname)).toEqual(["/system/order/payment-context"]);
            expect(calls[0]?.url.searchParams.get("orderId")).toBe(
                new URL(request.url).searchParams.get("orderId") || null,
            );
        }
    });

    test("redacts Commerce and Delivery failures at their exact stop point", async () => {
        const commerce = await executeBuyerTracking(successfulBuyerResponder({ failAt: "commerce" }));
        const delivery = await executeBuyerTracking(successfulBuyerResponder({ failAt: "delivery" }));

        await expectGenericFailure(commerce.response);
        expect(commerce.calls.map((call) => call.url.pathname)).toEqual(["/system/order/payment-context"]);
        await expectGenericFailure(delivery.response);
        expect(delivery.calls.map((call) => call.url.pathname)).toEqual([
            "/system/order/payment-context",
            "/shipmentForExternalOrder",
        ]);
    });

    test("fails closed on malformed context and shipment collections", async () => {
        const missingPublicId = await executeBuyerTracking(
            successfulBuyerResponder({ order: { publicId: undefined } }),
        );
        const nonArray = await executeBuyerTracking(successfulBuyerResponder({ items: { id: "shipment-42" } }));
        const missingShipmentId = await executeBuyerTracking(
            successfulBuyerResponder({
                items: [{ status: "label_ready", createdAt: "now", events: [] }],
            }),
        );

        await expectGenericFailure(missingPublicId.response);
        expect(missingPublicId.calls.map((call) => call.url.pathname)).toEqual(["/system/order/payment-context"]);
        await expectGenericFailure(nonArray.response);
        expect(missingShipmentId.response.status).toBe(403);
        expect(await missingShipmentId.response.json()).toEqual({
            error: "Forbidden",
        });
        expect(missingShipmentId.calls.map((call) => call.url.pathname)).toEqual([
            "/system/order/payment-context",
            "/shipmentForExternalOrder",
        ]);
    });

    test("keeps the single-shipment limit as a local 400 response", async () => {
        const { response, calls } = await executeBuyerTracking(
            successfulBuyerResponder({
                items: [
                    {
                        id: "shipment-1",
                        status: "label_ready",
                        createdAt: "2026-07-12T09:00:00.000Z",
                        events: [],
                    },
                    {
                        id: "shipment-2",
                        status: "label_ready",
                        createdAt: "2026-07-12T09:01:00.000Z",
                        events: [],
                    },
                ],
            }),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            error: 'forEach "tracking" exceeds max items',
        });
        expect(calls.map((call) => call.url.pathname)).toEqual([
            "/system/order/payment-context",
            "/shipmentForExternalOrder",
        ]);
    });
});
