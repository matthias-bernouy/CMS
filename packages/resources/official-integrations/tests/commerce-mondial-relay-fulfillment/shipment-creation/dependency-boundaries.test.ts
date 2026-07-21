import { describe, expect, test } from "bun:test";
import { expectGenericFailure } from "../order-contexts/shared/harness";
import { reservation, sellerSetup } from "./fixtures/context";
import { quote, shipment } from "./fixtures/delivery";
import { fulfillment } from "./fixtures/result";
import { executeShipmentCreation } from "./harness";
import {
    creationResponder,
    privateFailure,
    type CreationReplies,
} from "./responders";

describe("seller shipment creation dependency boundaries", () => {
    test("preserves setup seller and allowed refusals", async () => {
        const cases: Array<[unknown, number, string]> = [[{
            ...sellerSetup,
            sellerId: "another-seller",
        }, 403, "Fulfillment authorization belongs to another seller"], [{
            ...sellerSetup,
            allowed: false,
        }, 409, "Commerce has not authorized shipment creation"]];

        for (const [reply, status, error] of cases) {
            const { response, calls } = await executeShipmentCreation(
                creationResponder({ setup: reply }),
            );
            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ error });
            expect(calls.map(call => call.url.pathname)).toEqual(
                ["/shipmentCreationSellerContext"],
            );
        }
    });

    test("preserves the reservation seller refusal", async () => {
        const { response, calls } = await executeShipmentCreation(
            creationResponder({
                reservation: { ...reservation, sellerId: "another-seller" },
            }),
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: "Shipment creation reservation belongs to another seller",
        });
        expect(calls.map(call => call.url.pathname)).toEqual(
            expectedPaths(2),
        );
    });

    test("preserves the financial-terms projection failure", async () => {
        const { response, calls } = await executeShipmentCreation(
            creationResponder({
                setup: privateFailure(
                    502,
                    "invalid fulfillment authorization",
                ),
            }),
        );

        await expectGenericFailure(response);
        expect(calls.map(call => call.url.pathname)).toEqual(
            ["/shipmentCreationSellerContext"],
        );
    });

    test("redacts failures and stops at each causal boundary", async () => {
        const cases: Array<[CreationReplies, number]> = [
            [{ setup: privateFailure(500, "private setup") }, 1],
            [{ reservation: privateFailure(409, "private reservation") }, 2],
            [{ quote: privateFailure(404, "private quote") }, 3],
            [{ shipment: privateFailure(409, "private provider") }, 4],
            [{ fulfillment: privateFailure(500, "private completion") }, 5],
        ];

        for (const [replies, count] of cases) {
            const { response, calls } = await executeShipmentCreation(
                creationResponder(replies),
            );
            await expectGenericFailure(response);
            expect(calls.map(call => call.url.pathname)).toEqual(
                expectedPaths(count),
            );
        }
    });

    test("fails closed on malformed responses at every boundary", async () => {
        const cases: Array<[CreationReplies, number]> = [[{
            setup: { ...sellerSetup, allowed: "yes" },
        }, 1], [{
            reservation: { ...reservation, operationId: "501" },
        }, 2], [{
            quote: { ...quote, quoteId: 42 },
        }, 3], [{
            shipment: { ...shipment, id: 42 },
        }, 4], [{
            fulfillment: { ...fulfillment, attempts: "one" },
        }, 5]];

        for (const [replies, count] of cases) {
            const { response, calls } = await executeShipmentCreation(
                creationResponder(replies),
            );
            await expectGenericFailure(response);
            expect(calls.map(call => call.url.pathname)).toEqual(
                expectedPaths(count),
            );
        }
    });
});

function expectedPaths(count: number): string[] {
    return [
        "/shipmentCreationSellerContext", "/reserveShipmentCreation",
        "/resolveDeliveryQuote", "/createShipment",
        "/completeShipmentCreation",
    ].slice(0, count);
}
