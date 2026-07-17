import { describe, expect, test } from "bun:test";
import {
    authorization,
    buyerId,
    lockedFinancialTerms,
    orderPublicId,
    savedQuote,
    sellerAccount,
} from "../fixtures";
import { executeRelay } from "../harness";
import { successfulResponder } from "../responders";
import { callSnapshot } from "./calls";

describe("setRelayPointForOrder contract", () => {
    test("preserves response, call order, payloads, and provider freshness", async () => {
        const first = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder(),
        );
        const second = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder(),
        );

        expect(first.response.status).toBe(200);
        const responseBody = await first.response.json();
        expect(responseBody).toEqual({
            selection: savedQuote,
            financialTerms: lockedFinancialTerms,
        });
        expect(JSON.stringify(responseBody)).not.toContain("privateProvider");
        expect(first.calls.map(call => [
            call.method,
            call.url.pathname,
        ])).toEqual([
            ["GET", "/order"],
            ["GET", "/quote-authorization"],
            ["GET", "/account"],
            ["POST", "/relay-selection"],
            ["POST", "/resolve"],
            ["POST", "/financial-lock"],
        ]);
        expect(first.calls.map(call => Object.fromEntries(
            call.url.searchParams,
        ))).toEqual([
            { id: "42" },
            { orderPublicId },
            { userId: "seller-subject" },
            {},
            {},
            {},
        ]);
        expect(first.calls[3]?.body).toEqual({
            requestKey:
                `commerce-order:${orderPublicId}:version:1:relay:FR-024474`,
            externalOrderId: orderPublicId,
            orderVersion: 1,
            selectedForCmsUserId: buyerId,
            relayLocation: "FR-024474",
            country: "FR",
            postalCode: "75001",
            city: "Paris",
            currency: "eur",
            merchandiseSubtotalMinorAmount: 1000,
            recipientSnapshot: authorization.shippingAddress,
            sellerFulfillmentSnapshot: sellerAccount,
        });
        expect(first.calls[4]?.body).toEqual({
            quoteId: savedQuote.quoteId,
            externalOrderId: orderPublicId,
            selectedForCmsUserId: buyerId,
            orderVersion: 1,
            merchandiseSubtotalMinorAmount: 1000,
            currency: "eur",
            purpose: "financial_lock",
        });
        expect(first.calls[5]?.body).toEqual({
            orderPublicId,
            deliveryQuoteId: savedQuote.quoteId,
            shippingAmount: 450,
            currency: "eur",
            expectedVersion: 1,
        });
        expect(first.calls.map(call => call.userId)).toEqual([
            buyerId,
            buyerId,
            null,
            buyerId,
            null,
            buyerId,
        ]);
        expect(first.calls.map(call => call.accountUserId)).toEqual([
            null,
            null,
            buyerId,
            null,
            null,
            null,
        ]);
        expect(await second.response.json()).toEqual(responseBody);
        expect(second.calls.map(callSnapshot)).toEqual(
            first.calls.map(callSnapshot),
        );
    });
});
