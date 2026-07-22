import {
    JsonRecord,
    createHarness,
    expect,
    jsonBody,
    relaySelection,
    saveRelaySelection,
    sourceRequest,
    test,
    validDeliveryQuoteRequest,
} from "../../support";

export function registerRelayExpiryTests(): void {
    test("fails closed when an exact quote is expired or bound to another buyer", async () => {
        const harness = await createHarness();
        harness.deliveryQuotes[0]!.expires_at = "2020-01-01T00:00:00.000Z";
        const expired = await sourceRequest(harness, "resolveDeliveryQuote", {
            method: "POST",
            userId: "system",
            body: {
                quoteId: harness.deliveryQuotes[0]!.quote_id,
                externalOrderId: "order-1001",
                selectedForCmsUserId: "user-123",
                purpose: "financial_lock",
            },
        });
        const wrongBuyer = await sourceRequest(harness, "resolveDeliveryQuote", {
            method: "POST",
            userId: "system",
            body: {
                quoteId: harness.deliveryQuotes[0]!.quote_id,
                externalOrderId: "order-1001",
                selectedForCmsUserId: "other-buyer",
                purpose: "fulfillment",
            },
        });

        expect(expired.status).toBe(409);
        expect(wrongBuyer.status).toBe(404);
    });
}
