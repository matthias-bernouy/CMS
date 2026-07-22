import { describe, expect, test } from "bun:test";
import { buyerId, expectedQuote, expectedSelection, orderId, quoteRow, selectionRow } from "./fixtures.ts";
import { createRelaySelectionHarness, futureRpcPath } from "./harness.ts";

describe("Mondial Relay selection fallback contract", () => {
    test("a saved selection wins and stops before the quote lookup", async () => {
        const row = selectionRow();
        const harness = await createRelaySelectionHarness({
            selection: row,
            quotes: [quoteRow(9)],
            quoteError: true,
        });

        const response = await harness.call();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedSelection(row));
        expect(harness.logicalReads).toEqual(["selection"]);
    });

    test("the fallback returns the latest revision for the exact user", async () => {
        const latest = quoteRow(3);
        const harness = await createRelaySelectionHarness({
            quotes: [quoteRow(1), quoteRow(9, "another-user"), latest, quoteRow(2)],
        });

        const response = await harness.call();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedQuote(latest));
        expect(harness.logicalReads).toEqual(["selection", "quote"]);
    });

    test("an absent or blank user header never reads a quote", async () => {
        for (const userHeader of [null, "", "   "]) {
            const harness = await createRelaySelectionHarness({ quotes: [quoteRow(4)], userHeader });
            const response = await harness.call();

            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ error: "no pickup point is saved for this order" });
            expect(harness.logicalReads).toEqual(["selection"]);
        }
    });

    test("a quote belonging to another user is ignored with the exact missing error", async () => {
        const harness = await createRelaySelectionHarness({ quotes: [quoteRow(8, "another-user")] });

        const response = await harness.call();

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "no pickup point is saved for this order" });
        expect(harness.logicalReads).toEqual(["selection", "quote"]);
    });

    test("database errors retain selection-before-quote precedence", async () => {
        const selectionFailure = await createRelaySelectionHarness({ selectionError: true, quoteError: true });
        const firstResponse = await selectionFailure.call();
        expect(firstResponse.status).toBe(502);
        expect(await firstResponse.json()).toEqual({ error: "Supabase Data API request failed (500)" });
        expect(selectionFailure.logicalReads).toEqual(["selection"]);

        const quoteFailure = await createRelaySelectionHarness({ quoteError: true });
        const secondResponse = await quoteFailure.call();
        expect(secondResponse.status).toBe(502);
        expect(await secondResponse.json()).toEqual({ error: "Supabase Data API request failed (500)" });
        expect(quoteFailure.logicalReads).toEqual(["selection", "quote"]);
    });

    test("a quote committed between both reads is visible", async () => {
        const committedQuote = quoteRow(5);
        const harness = await createRelaySelectionHarness({ injectQuoteAfterSelection: committedQuote });

        const response = await harness.call();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedQuote(committedQuote));
        expect(harness.logicalReads).toEqual(["selection", "quote"]);
    });

    test("the fallback is one private context request", async () => {
        const latest = quoteRow(2);
        const harness = await createRelaySelectionHarness({ quotes: [latest] });

        expect((await harness.call()).status).toBe(200);
        expect(harness.requests).toEqual([
            {
                method: "POST",
                pathname: futureRpcPath,
                body: { p_external_order_id: orderId, p_selected_for_cms_user_id: buyerId },
            },
        ]);
    });

    test("a malformed future context fails closed", async () => {
        const harness = await createRelaySelectionHarness({ rpcMalformed: true });

        const response = await harness.call();

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: "relay selection context returned an invalid response",
        });
    });
});
