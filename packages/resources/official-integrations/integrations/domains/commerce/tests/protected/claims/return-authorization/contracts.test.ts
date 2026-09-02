import { describe, expect, setSystemTime, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { useReturnAuthorizationResponder } from "./fixtures";
import { claimRow, expectedAuthorization } from "./raw";

installCommerceTestEnvironment();

const route = "/system/claim/return-authorization?claimId=3000000007";

describe("commerce claim return authorization contracts", () => {
    test("returns the exact bounded authorization context", async () => {
        useReturnAuthorizationResponder();

        const response = await requestCommerce(route);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(expectedAuthorization);
        expect(Object.keys(body)).toHaveLength(17);
        expect(JSON.stringify(body)).not.toContain("Private Street");
        expect(JSON.stringify(body)).not.toContain("financial_terms_hash");
        expect(JSON.stringify(body)).not.toContain("future_private");
    });

    test("preserves nullable return fields without changing authorization", async () => {
        useReturnAuthorizationResponder({
            claim: {
                ...claimRow,
                return_ship_by_at: null,
                return_delivery_status: null,
            },
        });

        const response = await requestCommerce(route);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ...expectedAuthorization,
            returnShipByAt: null,
            returnDeliveryStatus: null,
        });
    });

    test("omits all three financial fields when terms are absent", async () => {
        useReturnAuthorizationResponder({ financialTerms: null });
        const {
            deliveryQuoteId: _quote,
            merchandiseSubtotalMinorAmount: _subtotal,
            currency: _currency,
            ...withoutFinancialTerms
        } = expectedAuthorization;

        const response = await requestCommerce(route);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(withoutFinancialTerms);
    });

    test("keeps explicit financial nulls distinct from a missing row", async () => {
        useReturnAuthorizationResponder({
            financialTerms: {
                delivery_quote_id: null,
                merchandise_subtotal_amount: null,
                currency: null,
            },
        });

        const response = await requestCommerce(route);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ...expectedAuthorization,
            deliveryQuoteId: null,
            merchandiseSubtotalMinorAmount: null,
            currency: null,
        });
    });

    test("preserves return state, deadline, and reason precedence", async () => {
        const cases = [
            {
                name: "future deadline",
                claim: claimRow,
                expected: { allowed: true, reason: "authorized" },
            },
            {
                name: "null deadline",
                claim: { ...claimRow, return_ship_by_at: null },
                expected: {
                    allowed: true,
                    reason: "authorized",
                    returnShipByAt: null,
                },
            },
            {
                name: "invalid deadline",
                claim: { ...claimRow, return_ship_by_at: "not-a-date" },
                expected: {
                    allowed: true,
                    reason: "authorized",
                    returnShipByAt: "not-a-date",
                },
            },
            {
                name: "past deadline",
                claim: { ...claimRow, return_ship_by_at: "2000-01-01T00:00:00.000Z" },
                expected: {
                    allowed: false,
                    reason: "return_ship_deadline_passed",
                    returnShipByAt: "2000-01-01T00:00:00.000Z",
                },
            },
            {
                name: "different status",
                claim: { ...claimRow, status: "under_review" },
                expected: {
                    allowed: false,
                    reason: "claim_not_awaiting_return",
                    claimStatus: "under_review",
                },
            },
            {
                name: "different outcome",
                claim: { ...claimRow, resolution_outcome: "buyer" },
                expected: { allowed: false, reason: "claim_not_awaiting_return" },
            },
            {
                name: "recipient handoff",
                claim: {
                    ...claimRow,
                    return_recipient_handoff_at: "2026-07-24T08:00:00.000Z",
                },
                expected: { allowed: false, reason: "claim_not_awaiting_return" },
            },
            {
                name: "non-awaiting state before an expired deadline",
                claim: {
                    ...claimRow,
                    status: "under_review",
                    return_ship_by_at: "2000-01-01T00:00:00.000Z",
                },
                expected: {
                    allowed: false,
                    reason: "claim_not_awaiting_return",
                    claimStatus: "under_review",
                    returnShipByAt: "2000-01-01T00:00:00.000Z",
                },
            },
        ];

        for (const item of cases) {
            useReturnAuthorizationResponder({ claim: item.claim });
            const response = await requestCommerce(route);

            expect({
                name: item.name,
                status: response.status,
                body: await response.json(),
            }).toEqual({
                name: item.name,
                status: 200,
                body: { ...expectedAuthorization, ...item.expected },
            });
        }
    });

    test("treats a deadline equal to the Edge clock as passed", async () => {
        const deadline = "2026-07-25T08:00:00.000Z";
        setSystemTime(new Date(deadline));
        try {
            useReturnAuthorizationResponder({
                claim: { ...claimRow, return_ship_by_at: deadline },
            });

            const response = await requestCommerce(route);

            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                allowed: false,
                reason: "return_ship_deadline_passed",
            });
        } finally {
            setSystemTime();
        }
    });
});
