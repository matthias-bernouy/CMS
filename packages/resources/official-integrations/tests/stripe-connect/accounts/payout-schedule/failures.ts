import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateAccountHandlerHarness, responseBody } from "../harness";

const validCommand = {
    userId: "seller-payout-missing",
    payoutScheduleChangeId: "payout-missing-1",
    interval: "daily",
};

export function registerPayoutScheduleFailureContracts(createHarness: CreateAccountHandlerHarness): void {
    describe("stripe-connect seller payout schedule failures", () => {
        test("validates the schedule before database or provider access", async () => {
            const harness = await createHarness();

            const response = await harness.submit("system", undefined, "configureSellerPayoutSchedule", {
                ...validCommand,
                interval: "weekly",
            });

            expect(response.status).toBe(400);
            expect(await responseBody(response)).toEqual({
                error: "weeklyPayoutDays is required for a weekly payout schedule",
            });
            expect(harness.rest.externalRequestOrder).toEqual([]);
            expect(harness.rest.rows("financial_operations")).toEqual([]);
        });

        test("returns the exact 404 for an absent account without claiming or calling Stripe", async () => {
            const harness = await createHarness();
            clearRequests(harness);

            const response = await harness.submit("system", undefined, "configureSellerPayoutSchedule", validCommand);

            expect(response.status).toBe(404);
            expect(await responseBody(response)).toEqual({ error: "connected account not found" });
            expect(harness.rest.externalRequestOrder).toEqual(["postgrest:GET:accounts"]);
            expect(harness.rest.rows("financial_operations")).toEqual([]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });

        test("returns the same 404 for an account without a provider ID and never persists a claim", async () => {
            const harness = await createHarness();
            harness.rest.seedPayoutScheduleAccount(validCommand.userId, false);
            clearRequests(harness);

            const response = await harness.submit("system", undefined, "configureSellerPayoutSchedule", validCommand);

            expect(response.status).toBe(404);
            expect(await responseBody(response)).toEqual({ error: "connected account not found" });
            expect(harness.rest.externalRequestOrder).toEqual(["postgrest:GET:accounts"]);
            expect(harness.rest.rows("accounts")[0]).toMatchObject({
                stripe_account_id: null,
                payout_hold_claimed_by: null,
                payout_hold_claimed_at: null,
            });
            expect(harness.rest.rows("financial_operations")).toEqual([]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}
