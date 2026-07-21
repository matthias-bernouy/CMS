import { describe, expect, test } from "bun:test";
import { expectGenericFailure } from "../../order-contexts/shared/harness";
import { reservation } from "../fixtures/context";
import { expectedShipmentRequest, replayShipment, shipment } from "../fixtures/delivery";
import {
    expectedCompletionRequest,
    replayFulfillment,
    replayResult,
} from "../fixtures/result";
import { executeShipmentCreation } from "../harness";
import { creationResponder, privateFailure } from "../responders";

describe("seller shipment creation recovery", () => {
    test("retries a lost Commerce completion with identical provider input", async () => {
        const replayClaimToken = "00000000-0000-4000-8000-000000000502";
        let reservationAttempt = 0;
        let shipmentAttempt = 0;
        let completionAttempt = 0;
        const responder = creationResponder({
            reservation: () => {
                reservationAttempt += 1;
                return reservationAttempt === 1
                    ? reservation
                    : {
                        ...reservation,
                        claimToken: replayClaimToken,
                        status: "succeeded",
                        fulfillmentStatus: "label_created",
                    };
            },
            shipment: () => {
                shipmentAttempt += 1;
                return Response.json(
                    shipmentAttempt === 1 ? shipment : replayShipment,
                    { status: shipmentAttempt === 1 ? 201 : 200 },
                );
            },
            fulfillment: () => {
                completionAttempt += 1;
                return completionAttempt === 1
                    ? privateFailure(500, "lost completion response")
                    : replayFulfillment;
            },
        });

        const failed = await executeShipmentCreation(responder);
        const replay = await executeShipmentCreation(responder);

        await expectGenericFailure(failed.response);
        expect(replay.response.status).toBe(200);
        expect(await replay.response.json()).toEqual(replayResult);
        expect(failed.calls.map(call => call.url.pathname)).toEqual(paths());
        expect(replay.calls.map(call => call.url.pathname)).toEqual(paths());
        expect(failed.calls[3]?.body).toEqual(expectedShipmentRequest());
        expect(replay.calls[3]?.body).toEqual(expectedShipmentRequest());
        expect(failed.calls[4]?.body).toEqual(expectedCompletionRequest());
        expect(replay.calls[4]?.body).toEqual({
            ...expectedCompletionRequest(),
            claimToken: replayClaimToken,
        });
    });
});

function paths() {
    return [
        "/shipmentCreationSellerContext", "/reserveShipmentCreation",
        "/resolveDeliveryQuote", "/createShipment",
        "/completeShipmentCreation",
    ];
}
