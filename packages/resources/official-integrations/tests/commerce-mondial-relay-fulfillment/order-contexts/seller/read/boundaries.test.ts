import { describe, expect, test } from "bun:test";
import { shipment } from "../../shared/fixtures";
import { expectGenericFailure } from "../../shared/harness";
import {
    orderPublicId,
    sellerSale,
    sellerTrackingResponse,
} from "../shared/fixtures";
import {
    executeSellerFunction,
    sellerGetRequest,
} from "../shared/harness";
import { sellerResponder } from "../shared/responders";

const functionId = "getShipmentForMySale";

describe("seller shipment read boundaries", () => {
    test("fails before source work when the authenticated subject is missing", async () => {
        const { response, calls } = await execute(
            sellerGetRequest(functionId, "42"),
            sellerResponder(),
            null,
        );

        await expectGenericFailure(response);
        expect(calls).toEqual([]);
    });

    test("forwards optional string selectors and stops on Commerce refusal", async () => {
        for (const orderId of [
            undefined, "", "invalid", "7.5", "-1", "0",
            "9007199254740992",
        ]) {
            const request = sellerGetRequest(functionId, orderId);
            const responder = (outgoing: Request) => Response.json({
                error: "private Commerce selector failure",
                shippingAddress: "7 Private Street",
            }, { status: 404 });
            const { response, calls } = await execute(request, responder);

            await expectGenericFailure(response);
            expect(calls.map(call => call.url.pathname)).toEqual(["/mySale"]);
            expect(calls[0]?.url.searchParams.get("id")).toBe(orderId || null);
        }
    });

    test("redacts Commerce and Delivery failures at their exact stop point", async () => {
        const failure = () => Response.json({
            error: "private provider failure",
            address: "7 Private Street",
        }, { status: 409 });
        const commerce = await executeRead(sellerResponder({ sale: failure() }));
        const delivery = await executeRead(sellerResponder({ shipments: failure() }));

        await expectGenericFailure(commerce.response);
        expect(commerce.calls.map(call => call.url.pathname)).toEqual(["/mySale"]);
        await expectGenericFailure(delivery.response);
        expect(delivery.calls.map(call => call.url.pathname)).toEqual([
            "/mySale", "/shipmentForExternalOrder",
        ]);
    });

    test("preserves incomplete Commerce context behavior", async () => {
        const missingId = await executeRead(sellerResponder({
            sale: { ...sellerSale, id: undefined },
        }));
        const missingNumber = await executeRead(sellerResponder({
            sale: { ...sellerSale, orderNumber: undefined },
        }));
        const missingPublicId = await executeRead(sellerResponder({
            sale: { ...sellerSale, publicId: undefined },
        }));

        expect(missingId.response.status).toBe(200);
        const withoutId = await missingId.response.json();
        expect(withoutId).toEqual({
            orderPublicId,
            orderNumber: sellerSale.orderNumber,
            shipments: sellerTrackingResponse.shipments,
        });
        expect(Object.hasOwn(withoutId, "orderId")).toBe(false);
        expect(missingNumber.response.status).toBe(200);
        const withoutNumber = await missingNumber.response.json();
        expect(Object.hasOwn(withoutNumber, "orderNumber")).toBe(false);
        expect(withoutNumber.orderId).toBe(sellerSale.id);
        await expectGenericFailure(missingPublicId.response);
        expect(missingPublicId.calls.map(call => call.url.pathname)).toEqual([
            "/mySale",
        ]);
    });

    test("fails closed on malformed Commerce and Delivery responses", async () => {
        const malformedSale = await executeRead(sellerResponder({
            sale: Response.json([]),
        }));
        const malformedItems = await executeRead(sellerResponder({
            shipments: { items: { id: shipment.id } },
        }));
        const missingItems = await executeRead(sellerResponder({ shipments: {} }));

        await expectGenericFailure(malformedSale.response);
        expect(malformedSale.calls.map(call => call.url.pathname)).toEqual([
            "/mySale",
        ]);
        await expectGenericFailure(malformedItems.response);
        expect(malformedItems.calls.map(call => call.url.pathname)).toEqual([
            "/mySale", "/shipmentForExternalOrder",
        ]);
        expect(missingItems.response.status).toBe(400);
        expect(await missingItems.response.json()).toEqual({
            error: 'forEach "details" items must be an array',
        });
    });

    test("keeps a missing shipment id as a local refusal", async () => {
        const { response, calls } = await executeRead(sellerResponder({
            shipments: { items: [{ ...shipment, id: undefined }] },
        }));

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "Forbidden" });
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/mySale", "/shipmentForExternalOrder",
        ]);
    });

    test("keeps the single-shipment limit as a local 400 response", async () => {
        const { response, calls } = await executeRead(sellerResponder({
            shipments: { items: [
                { ...shipment, id: "shipment-1" },
                { ...shipment, id: "shipment-2" },
            ] },
        }));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            error: 'forEach "details" exceeds max items',
        });
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/mySale", "/shipmentForExternalOrder",
        ]);
    });
});

function executeRead(responder = sellerResponder()) {
    return execute(sellerGetRequest(functionId, "42"), responder);
}

function execute(
    request: Request,
    responder: (request: Request) => Response,
    user?: null,
) {
    return executeSellerFunction(functionId, request, responder, user);
}
