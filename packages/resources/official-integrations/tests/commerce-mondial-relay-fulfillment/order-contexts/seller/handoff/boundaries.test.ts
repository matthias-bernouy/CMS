import { describe, expect, test } from "bun:test";
import { expectGenericFailure } from "../../shared/harness";
import { fulfillment, handoff, replayFulfillment, sellerSale } from "../shared/fixtures";
import { executeSellerFunction, sellerPostRequest } from "../shared/harness";
import { sellerResponder } from "../shared/responders";
const functionId = "declareShipmentHandoffForMySale";
const request = (body?: unknown) => sellerPostRequest(functionId, body);

describe("seller shipment handoff boundaries", () => {
    test("validates the authenticated request before source work", async () => {
        const missingIdentity = await executeSellerFunction(
            functionId,
            request({ orderId: "42" }),
            sellerResponder(),
            null,
        );
        await expectGenericFailure(missingIdentity.response);
        expect(missingIdentity.calls).toEqual([]);

        const cases: Array<[unknown, string]> = [
            [{}, "body.orderId is required"],
            [{ orderId: 42 }, "body.orderId must be a string"],
            [{ orderId: "42", extra: true }, "body.extra is not allowed"],
        ];
        for (const [body, error] of cases) {
            const result = await executeSellerFunction(functionId, request(body), sellerResponder());
            expect(result.response.status).toBe(400);
            expect(await result.response.json()).toEqual({ error });
            expect(result.calls).toEqual([]);
        }
    });

    test("redacts Commerce validation and ownership refusals before Delivery", async () => {
        for (const [incoming, upstream] of [
            [request(), privateFailure(400, "id or publicId is required")],
            [request({ orderId: "42" }), privateFailure(404, "sale not found")],
        ] as const) {
            const result = await executeSellerFunction(functionId, incoming, sellerResponder({ sale: upstream }));
            await expectGenericFailure(result.response);
            expect(result.calls.map((call) => call.url.pathname)).toEqual(["/sellerContext"]);
        }
    });

    test("lets Delivery reject a missing Commerce order public id", async () => {
        const fallback = sellerResponder({
            sale: { ...sellerSale, publicId: undefined },
        });
        const result = await executeSellerFunction(functionId, request({ orderId: "42" }), (outgoing) =>
            new URL(outgoing.url).pathname === "/declareSellerHandoff"
                ? privateFailure(400, "externalOrderId is required")
                : fallback(outgoing),
        );

        await expectGenericFailure(result.response);
        expect(result.calls.map((call) => call.url.pathname)).toEqual(["/sellerContext", "/declareSellerHandoff"]);
        expect(result.calls[1]?.body).toEqual({});
    });

    test("redacts Delivery failures at the second call", async () => {
        for (const handoffReply of [
            privateFailure(404, "shipment not found"),
            privateFailure(409, "seller handoff cannot be declared"),
        ]) {
            const result = await executeSellerFunction(
                functionId,
                request({ orderId: "42" }),
                sellerResponder({ handoff: handoffReply }),
            );

            await expectGenericFailure(result.response);
            expect(result.calls.map((call) => call.url.pathname)).toEqual(["/sellerContext", "/declareSellerHandoff"]);
        }
    });

    test("lets Commerce reject an incomplete successful Delivery response", async () => {
        const fallback = sellerResponder({
            handoff: { id: "shipment-42", externalOrderId: sellerSale.publicId, status: "label_ready" },
        });
        const result = await executeSellerFunction(functionId, request({ orderId: "42" }), (outgoing) =>
            new URL(outgoing.url).pathname === "/recordFulfillment"
                ? privateFailure(400, "occurredAt is required")
                : fallback(outgoing),
        );

        await expectGenericFailure(result.response);
        expect(result.calls.map((call) => call.url.pathname)).toEqual(expectedPaths());
        expect(result.calls[2]?.body).toEqual({
            orderPublicId: sellerSale.publicId,
            providerEventId: "mondial-relay||seller_handoff|",
            normalizedStatus: "seller_handoff_declared",
        });
    });

    test("redacts Commerce projection failure after Delivery mutated", async () => {
        const result = await executeSellerFunction(
            functionId,
            request({ orderId: "42" }),
            sellerResponder({
                fulfillment: privateFailure(409, "fulfillment conflict"),
            }),
        );

        await expectGenericFailure(result.response);
        expect(result.calls.map((call) => call.url.pathname)).toEqual(expectedPaths());
        expect(result.calls[1]?.body).toEqual({ externalOrderId: sellerSale.publicId });
        expect(result.calls[2]?.body).toMatchObject({
            providerEventId: expectedEventId(),
            occurredAt: handoff.sellerHandoffDeclaredAt,
        });
    });

    test("repairs a post-Delivery failure with the same replay event", async () => {
        let projectionCount = 0;
        const fallback = sellerResponder();
        const responder = (outgoing: Request) => {
            if (new URL(outgoing.url).pathname !== "/recordFulfillment") {
                return fallback(outgoing);
            }
            projectionCount += 1;
            return projectionCount === 1
                ? privateFailure(409, "private projection conflict")
                : Response.json(replayFulfillment);
        };

        const failed = await executeSellerFunction(functionId, request({ orderId: "42" }), responder);
        const repaired = await executeSellerFunction(functionId, request({ orderId: "42" }), responder);

        await expectGenericFailure(failed.response);
        expect(repaired.response.status).toBe(200);
        const body = await repaired.response.json();
        expect(body).toEqual({
            shipment: handoff,
            fulfillment: withoutUndefined(replayFulfillment),
        });
        expect(failed.calls.map((call) => call.url.pathname)).toEqual(expectedPaths());
        expect(repaired.calls.map((call) => call.url.pathname)).toEqual(expectedPaths());
        expect(failed.calls[2]?.body).toEqual(repaired.calls[2]?.body);
        expect(repaired.calls[2]?.body).toMatchObject({ providerEventId: expectedEventId() });
        expect(JSON.stringify(body)).not.toContain("idempotentReplay");
        expect(fulfillment.orderPublicId).toBe(sellerSale.publicId);
    });
});

function privateFailure(status: number, error: string): Response {
    return Response.json(
        {
            error,
            recipientAddress: "7 Private Street",
            providerPayload: { reference: "private-provider-reference" },
        },
        { status },
    );
}

function expectedEventId(): string {
    return `mondial-relay|${handoff.expeditionNumber}|seller_handoff|${handoff.sellerHandoffDeclaredAt}`;
}

function expectedPaths(): string[] {
    return ["/sellerContext", "/declareSellerHandoff", "/recordFulfillment"];
}

function withoutUndefined(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
