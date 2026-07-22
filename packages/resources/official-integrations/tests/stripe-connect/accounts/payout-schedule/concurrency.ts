import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateAccountHandlerHarness, responseBody } from "../harness";

export function registerPayoutScheduleConcurrencyContracts(createHarness: CreateAccountHandlerHarness): void {
    describe("stripe-connect seller payout schedule concurrency", () => {
        test("rejects a colliding update without a second claim write or provider call", async () => {
            const harness = await createHarness();
            const userId = "seller-payout-collision";
            harness.rest.seedPayoutScheduleAccount(userId, true);
            clearRequests(harness);
            const pause = harness.rest.pauseNextSellerBalanceSettingsUpdate();
            const first = harness.submit("system", undefined, "configureSellerPayoutSchedule", {
                userId,
                payoutScheduleChangeId: "payout-collision-first",
                interval: "weekly",
                weeklyPayoutDays: ["monday"],
            });

            await pause.entered;
            const postgrestStart = harness.rest.postgrestRequests.length;
            const providerStart = harness.rest.stripeRequests.length;
            const orderStart = harness.rest.externalRequestOrder.length;
            const firstClaim = harness.rest.rows("accounts")[0]?.payout_hold_claimed_by;
            let collision: Response;
            try {
                collision = await harness.submit("system", undefined, "configureSellerPayoutSchedule", {
                    userId,
                    payoutScheduleChangeId: "payout-collision-second",
                    interval: "monthly",
                    monthlyPayoutDays: [15],
                });
                expect(collision.status).toBe(409);
                expect(await responseBody(collision)).toEqual({
                    error: "another seller payout control update is already in progress",
                });
                expect(
                    harness.rest.postgrestRequests.slice(postgrestStart).map(({ method, table }) => ({
                        method,
                        table,
                    })),
                ).toEqual([
                    { method: "GET", table: "accounts" },
                    { method: "POST", table: "rpc/claim_seller_payout_hold" },
                ]);
                expect(harness.rest.externalRequestOrder.slice(orderStart)).toEqual([
                    "postgrest:GET:accounts",
                    "postgrest:POST:rpc/claim_seller_payout_hold",
                ]);
                expect(harness.rest.stripeRequests.slice(providerStart)).toEqual([]);
                expect(harness.rest.rows("accounts")[0]?.payout_hold_claimed_by).toBe(firstClaim);
                expect(harness.rest.rows("financial_operations")).toHaveLength(1);
            } finally {
                pause.resume();
            }

            expect((await first).status).toBe(200);
        });
    });
}
