import { describe, expect, test } from "bun:test";
import { expectGenericFailure } from "../order-contexts/shared/harness";
import { eligibility, reservation } from "./fixtures/context";
import { quote, shipment } from "./fixtures/delivery";
import { fulfillment } from "./fixtures/result";
import { executeShipmentCreation } from "./harness";
import {
    creationResponder,
    privateFailure,
    type CreationReplies,
} from "./responders";

describe("seller shipment creation dependency boundaries", () => {
    test("preserves eligibility seller and allowed refusals", async () => {
        const cases: Array<[unknown, number, string]> = [[{
            ...eligibility,
            sellerId: "another-seller",
        }, 403, "Fulfillment authorization belongs to another seller"], [{
            ...eligibility,
            allowed: false,
            reason: "stripe_dispute_open",
        }, 409, "Commerce has not authorized shipment creation"]];

        for (const [reply, status, error] of cases) {
            const { response, calls } = await executeShipmentCreation(
                creationResponder({ eligibility: reply }),
            );
            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ error });
            expect(calls.map(call => call.url.pathname)).toEqual([
                "/mySale", "/fulfillmentAuthorization",
            ]);
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
            expectedPaths(3),
        );
    });

    test("preserves the financial-terms projection failure", async () => {
        const { response, calls } = await executeShipmentCreation(
            creationResponder({
                eligibility: {
                    ...eligibility,
                    allowed: false,
                    reason: "financial_terms_missing",
                    financialTermsHash: null,
                },
            }),
        );

        await expectGenericFailure(response);
        expect(calls.map(call => call.url.pathname)).toEqual([
            "/mySale", "/fulfillmentAuthorization",
        ]);
    });

    test("redacts failures and stops at each causal boundary", async () => {
        const cases: Array<[CreationReplies, number]> = [
            [{ eligibility: privateFailure(500, "private eligibility") }, 2],
            [{ reservation: privateFailure(409, "private reservation") }, 3],
            [{ quote: privateFailure(404, "private quote") }, 4],
            [{ shipment: privateFailure(409, "private provider") }, 5],
            [{ fulfillment: privateFailure(500, "private completion") }, 6],
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
            eligibility: { ...eligibility, allowed: "yes" },
        }, 2], [{
            reservation: { ...reservation, operationId: "501" },
        }, 3], [{
            quote: { ...quote, quoteId: 42 },
        }, 4], [{
            shipment: { ...shipment, id: 42 },
        }, 5], [{
            fulfillment: { ...fulfillment, attempts: "one" },
        }, 6]];

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
        "/mySale", "/fulfillmentAuthorization", "/reserveShipmentCreation",
        "/resolveDeliveryQuote", "/createShipment",
        "/completeShipmentCreation",
    ].slice(0, count);
}
