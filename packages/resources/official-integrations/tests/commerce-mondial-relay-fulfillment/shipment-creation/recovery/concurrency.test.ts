import { describe, expect, test } from "bun:test";
import { expectGenericFailure } from "../../order-contexts/shared/harness";
import { expectedShipmentRequest, shipment } from "../fixtures/delivery";
import { creationResult, fulfillment } from "../fixtures/result";
import { executeShipmentCreation } from "../harness";
import { creationResponder, privateFailure } from "../responders";

describe("seller shipment creation concurrent orchestration", () => {
    test("preserves the in-progress conflict while one shipment is creating", async () => {
        let shipmentAttempt = 0;
        let releaseFirstShipment = () => {};
        const concurrentShipmentReached = new Promise<void>(resolve => {
            releaseFirstShipment = resolve;
        });
        const responder = creationResponder({
            shipment: async () => {
                shipmentAttempt += 1;
                if (shipmentAttempt === 1) {
                    await concurrentShipmentReached;
                    return Response.json(shipment, { status: 201 });
                }
                releaseFirstShipment();
                return privateFailure(
                    409,
                    "shipment creation is already in progress",
                );
            },
            fulfillment,
        });

        const results = await Promise.all([
            executeShipmentCreation(responder),
            executeShipmentCreation(responder),
        ]);

        const succeeded = results.find(result => result.response.status === 200);
        const failed = results.find(result => result.response.status !== 200);
        if (!succeeded || !failed) {
            throw new Error("expected one successful and one failed creation");
        }
        expect(await succeeded.response.json()).toEqual(creationResult);
        await expectGenericFailure(failed.response);
        expect(succeeded.calls.map(call => call.url.pathname)).toEqual(paths());
        expect(failed.calls.map(call => call.url.pathname)).toEqual(
            paths().slice(0, 4),
        );
        expect(results[0]?.calls[1]?.body).toEqual(results[1]?.calls[1]?.body);
        expect(results[0]?.calls[3]?.body).toEqual(results[1]?.calls[3]?.body);
        expect(results[0]?.calls[3]?.body).toEqual(expectedShipmentRequest());
        expect(results.flatMap(result => result.calls).filter(
            call => call.url.pathname === "/completeShipmentCreation",
        )).toHaveLength(1);
    });
});

function paths() {
    return [
        "/shipmentCreationSellerContext", "/reserveShipmentCreation",
        "/resolveDeliveryQuote", "/createShipment",
        "/completeShipmentCreation",
    ];
}
