import { describe, expect, test } from "bun:test";
import { lockedFinancialTerms, orderPublicId, savedQuote } from "../fixtures";
import { executeRelay } from "../harness";
import { successfulResponder } from "../responders";

describe("setRelayPointForOrder contract", () => {
    test("preserves nullable relay coordinates in the saved selection", async () => {
        const result = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder({
                savedQuote: { latitude: null, longitude: null },
            }),
        );

        expect(result.response.status).toBe(200);
        expect(await result.response.json()).toEqual({
            selection: {
                ...savedQuote,
                latitude: null,
                longitude: null,
            },
            financialTerms: lockedFinancialTerms,
        });
        expect(result.calls).toHaveLength(5);
    });

    test("locks the values returned by quote resolution", async () => {
        const resolvedQuoteId = `mrq_${"b".repeat(64)}`;
        const result = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder({
                resolvedQuote: {
                    quoteId: resolvedQuoteId,
                    shippingAmount: 475,
                    currency: "usd",
                },
            }),
        );

        expect(result.response.status).toBe(200);
        expect(result.calls[4]?.body).toEqual({
            orderPublicId,
            deliveryQuoteId: resolvedQuoteId,
            shippingAmount: 475,
            currency: "usd",
            expectedVersion: 1,
        });
    });
});
