import { describe, expect, test } from "bun:test";
import {
    type AccountHandlerHarness,
    type CreateAccountHandlerHarness,
    type JsonRecord,
    responseBody,
} from "../harness";

const routeUrl = "https://project.supabase.co/functions/v1/cms-stripe-connect/admin/accounts/account/payout-schedule";
const validCommand = {
    userId: "seller-payout-validation",
    payoutScheduleChangeId: "payout-validation-1",
    interval: "daily",
};

export function registerPayoutScheduleValidationContracts(createHarness: CreateAccountHandlerHarness): void {
    describe("stripe-connect seller payout schedule validation contracts", () => {
        test("authenticates before parsing or contacting Supabase and Stripe", async () => {
            const harness = await createHarness();

            const response = await directSubmit(harness, validCommand, false);

            expect(response.status).toBe(401);
            expect(await responseBody(response)).toEqual({ error: "invalid CMS API key" });
            expect(harness.rest.externalRequestOrder).toEqual([]);
        });

        test("keeps every route validation branch ahead of Supabase and Stripe", async () => {
            const harness = await createHarness();
            const cases: Array<[unknown, string]> = [
                [{ ...validCommand, unexpected: true }, "unexpected is not allowed"],
                [{}, "userId is required"],
                [{ ...validCommand, userId: "x".repeat(201) }, "userId is too long"],
                [{ userId: validCommand.userId, interval: "daily" }, "payoutScheduleChangeId is required"],
                [{ ...validCommand, payoutScheduleChangeId: "x".repeat(201) }, "payoutScheduleChangeId is too long"],
                [{ ...validCommand, interval: null }, "interval is required"],
                [{ ...validCommand, interval: "yearly" }, "interval must be manual, daily, weekly, or monthly"],
                [{ ...validCommand, weeklyPayoutDays: "monday" }, "weeklyPayoutDays must be an array"],
                [{ ...validCommand, weeklyPayoutDays: ["holiday"] }, "weeklyPayoutDays contains an invalid day"],
                [
                    { ...validCommand, weeklyPayoutDays: ["monday", "monday"] },
                    "weeklyPayoutDays contains duplicate days",
                ],
                [
                    { ...validCommand, weeklyPayoutDays: ["monday"] },
                    "weeklyPayoutDays is allowed only for a weekly payout schedule",
                ],
                [
                    { ...validCommand, interval: "monthly" },
                    "monthlyPayoutDays is required for a monthly payout schedule",
                ],
                [{ ...validCommand, monthlyPayoutDays: "1" }, "monthlyPayoutDays must be an array"],
                [{ ...validCommand, monthlyPayoutDays: [0] }, "monthlyPayoutDays must contain days from 1 to 31"],
                [{ ...validCommand, monthlyPayoutDays: [1, 1] }, "monthlyPayoutDays contains duplicate days"],
                [
                    { ...validCommand, monthlyPayoutDays: [1] },
                    "monthlyPayoutDays is allowed only for a monthly payout schedule",
                ],
                [{ ...validCommand, minimumBalanceEur: 1.5 }, "minimumBalanceEur must be an integer"],
                [{ ...validCommand, minimumBalanceEur: -1 }, "minimumBalanceEur must be non-negative"],
                [{ ...validCommand, delayDaysOverride: -1 }, "delayDaysOverride must be non-negative"],
                [{ ...validCommand, delayDaysOverride: 32 }, "delayDaysOverride must be between zero and 31"],
                [{ ...validCommand, debitNegativeBalances: "yes" }, "debitNegativeBalances must be a boolean"],
                [{ ...validCommand, reason: false }, "reason must be a string"],
                [{ ...validCommand, reason: "x".repeat(501) }, "reason is too long"],
                [[], "body must be an object"],
            ];

            for (const [body, error] of cases) {
                const response = await directSubmit(harness, body);

                expect(response.status).toBe(400);
                expect(await responseBody(response)).toEqual({ error });
                expect(harness.rest.externalRequestOrder).toEqual([]);
            }

            const malformed = await directRawSubmit(harness, "{");
            expect(malformed.status).toBe(400);
            expect(await responseBody(malformed)).toEqual({ error: "invalid JSON body" });
            expect(harness.rest.externalRequestOrder).toEqual([]);
        });
    });
}

async function directSubmit(harness: AccountHandlerHarness, body: unknown, authenticated = true): Promise<Response> {
    return await directRawSubmit(harness, JSON.stringify(body), authenticated);
}

async function directRawSubmit(harness: AccountHandlerHarness, body: string, authenticated = true): Promise<Response> {
    const headers = new Headers({ "content-type": "application/json" });
    if (authenticated) {
        headers.set("authorization", `Bearer ${harness.apiKey}`);
    }
    return await harness.edgeRequest(new Request(routeUrl, { method: "POST", headers, body }));
}
