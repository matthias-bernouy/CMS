import { describe, expect, test } from "bun:test";
import { loadFulfillmentFunction } from "../../shared/harness";
import { fulfillment, handoff, orderPublicId, replayFulfillment, sellerId } from "../shared/fixtures";
import { executeSellerFunction, sellerPostRequest } from "../shared/harness";
import { sellerResponder } from "../shared/responders";

const functionId = "declareShipmentHandoffForMySale";

describe("seller shipment handoff contract", () => {
    test("preserves the exact first-pass response and causal call contract", async () => {
        const { response, calls } = await executeSellerFunction(
            functionId,
            sellerPostRequest(functionId, { orderId: "42" }),
            sellerResponder(),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ shipment: handoff, fulfillment });
        expect(Object.keys(body)).toEqual(["shipment", "fulfillment"]);
        expect(Object.keys(body.shipment)).toEqual([
            "id",
            "externalOrderId",
            "expeditionNumber",
            "status",
            "sellerHandoffDeclaredAt",
        ]);
        expect(Object.keys(body.fulfillment)).toEqual([
            "orderId",
            "orderPublicId",
            "status",
            "providerReference",
            "carrierAcceptedAt",
            "sellerHandoffDeclaredAt",
            "recipientHandoffAt",
            "recipientHandoffFirstObservedAt",
            "claimWindowStartedAt",
            "claimByAt",
            "releaseEligibleAt",
            "blockingReason",
            "version",
        ]);
        expect(JSON.stringify(body)).not.toContain("Private");
        expect(JSON.stringify(body)).not.toContain("financial-hash");
        expect(JSON.stringify(body)).not.toContain("idempotentReplay");

        expect(
            calls.map((call) => ({
                method: call.method,
                path: call.url.pathname,
                params: Object.fromEntries(call.url.searchParams),
                body: call.body,
                userId: call.userId,
            })),
        ).toEqual([
            {
                method: "GET",
                path: "/sellerContext",
                params: { orderId: "42" },
                body: undefined,
                userId: sellerId,
            },
            {
                method: "POST",
                path: "/declareSellerHandoff",
                params: {},
                body: { externalOrderId: orderPublicId },
                userId: sellerId,
            },
            {
                method: "POST",
                path: "/recordFulfillment",
                params: {},
                body: expectedProjectionBody(),
                userId: null,
            },
        ]);
    });

    test("preserves fresh three-call work and the replay field omission", async () => {
        let projectionCount = 0;
        const fallback = sellerResponder();
        const responder = (request: Request) => {
            if (new URL(request.url).pathname !== "/recordFulfillment") {
                return fallback(request);
            }
            projectionCount += 1;
            return Response.json(projectionCount === 1 ? fulfillment : replayFulfillment);
        };

        const first = await executeSellerFunction(
            functionId,
            sellerPostRequest(functionId, { orderId: "42" }),
            responder,
        );
        const replay = await executeSellerFunction(
            functionId,
            sellerPostRequest(functionId, { orderId: "42" }),
            responder,
        );

        expect(first.response.status).toBe(200);
        expect(await first.response.json()).toEqual({ shipment: handoff, fulfillment });
        expect(replay.response.status).toBe(200);
        const replayBody = await replay.response.json();
        expect(replayBody).toEqual({
            shipment: handoff,
            fulfillment: withoutUndefined(replayFulfillment),
        });
        expect(Object.hasOwn(replayBody.fulfillment, "orderPublicId")).toBe(false);
        expect(first.calls.map((call) => call.url.pathname)).toEqual(expectedPaths());
        expect(replay.calls.map((call) => call.url.pathname)).toEqual(expectedPaths());
        expect(first.calls[2]?.body).toEqual(expectedProjectionBody());
        expect(replay.calls[2]?.body).toEqual(expectedProjectionBody());
    });

    test("keeps the declared authenticated POST boundary", async () => {
        const fn = await loadFulfillmentFunction(functionId);
        expect({ method: fn.method, access: fn.access }).toEqual({
            method: "POST",
            access: { mode: "auth" },
        });
    });
});

function expectedProjectionBody() {
    return {
        orderPublicId,
        providerEventId: `mondial-relay|${handoff.expeditionNumber}|seller_handoff|${handoff.sellerHandoffDeclaredAt}`,
        normalizedStatus: "seller_handoff_declared",
        occurredAt: handoff.sellerHandoffDeclaredAt,
        providerReference: handoff.expeditionNumber,
        sellerHandoffDeclaredAt: handoff.sellerHandoffDeclaredAt,
    };
}

function expectedPaths(): string[] {
    return ["/sellerContext", "/declareSellerHandoff", "/recordFulfillment"];
}

function withoutUndefined(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
