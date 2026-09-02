import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateAccountHandlerHarness, responseBody } from "../harness";

const command = {
    userId: "seller-payout-provider-loss",
    payoutScheduleChangeId: "provider-loss-1",
    interval: "weekly",
    weeklyPayoutDays: ["monday"],
    minimumBalanceEur: 350,
};

export function registerPayoutScheduleCleanupContracts(createHarness: CreateAccountHandlerHarness): void {
    describe("stripe-connect seller payout schedule failure cleanup", () => {
        test("preserves ambiguous cleanup and the exact manual-review replay", async () => {
            const harness = await createHarness();
            harness.rest.seedPayoutScheduleAccount(command.userId, true);
            harness.rest.loseNextSellerPayoutSettingsResponse();
            clearRequests(harness);

            const failed = await harness.submit("system", undefined, "configureSellerPayoutSchedule", command);

            expect(failed.status).toBe(502);
            expect(await responseBody(failed)).toEqual({
                error: "provider request failed",
            });
            expect(harness.rest.externalRequestOrder).toEqual(ambiguousOrder());
            expect(harness.rest.postgrestRequests.map(({ method, table }) => ({ method, table }))).toEqual(
                ambiguousOrder()
                    .filter((entry) => entry.startsWith("postgrest:"))
                    .map((entry) => {
                        const [, method, table] = entry.split(":");
                        return { method, table };
                    }),
            );
            expect(harness.rest.rows("financial_operations")).toEqual([
                expect.objectContaining({
                    business_key: `payout-schedule:${command.userId}:${command.payoutScheduleChangeId}`,
                    status: "manual_review",
                    attempt_count: 1,
                    last_error: "connection closed after Stripe committed the update",
                }),
            ]);
            expect(harness.rest.rows("accounts")[0]).toMatchObject({
                risk_status: "manual_review",
                financial_hold_reason: "Seller recovery payout hold is not confirmed",
                payout_hold_claimed_by: null,
                payout_hold_claimed_at: null,
            });
            expect(harness.rest.rows("provider_exceptions")).toEqual([
                expect.objectContaining({
                    operation_id: 1,
                    exception_type: "payout_schedule_update_ambiguous",
                    severity: "critical",
                    message: "connection closed after Stripe committed the update",
                    details: providerExceptionDetails(command.userId, command.payoutScheduleChangeId, "weekly", {
                        weeklyPayoutDays: ["monday"],
                        minimumBalanceEur: 350,
                    }),
                }),
            ]);
            expect(harness.rest.balanceSettingsUpdateCount).toBe(1);

            harness.rest.setConnectedPayoutSettings("daily", 0);
            clearRequests(harness);
            const replay = await harness.submit("system", undefined, "configureSellerPayoutSchedule", command);

            expect(replay.status).toBe(409);
            expect(await responseBody(replay)).toEqual({
                error: "payout schedule state is ambiguous and requires finance review",
            });
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/claim_seller_payout_hold",
                "postgrest:POST:rpc/reserve_account_financial_operation",
                "stripe:GET:/v1/balance_settings",
                "postgrest:PATCH:financial_operations",
                "postgrest:POST:rpc/cancel_seller_payout_configuration",
            ]);
            expect(harness.rest.rows("financial_operations")[0]).toMatchObject({
                status: "failed",
                attempt_count: 1,
                last_error: "payout schedule state is ambiguous and requires finance review",
            });
            expect(harness.rest.balanceSettingsUpdateCount).toBe(1);
        });

        test("keeps exact hold cleanup when operation reservation fails", async () => {
            const harness = await createHarness();
            const userId = "seller-payout-reservation-failure";
            const changeId = "reservation-failure-1";
            harness.rest.seedPayoutScheduleAccount(userId, true);
            harness.rest.failNextPostgrestWrite("rpc/reserve_account_financial_operation", "POST");
            clearRequests(harness);

            const response = await harness.submit("system", undefined, "configureSellerPayoutSchedule", {
                userId,
                payoutScheduleChangeId: changeId,
                interval: "daily",
            });

            expect(response.status).toBe(502);
            expect(await responseBody(response)).toEqual({
                error: "simulated rpc/reserve_account_financial_operation POST failure",
            });
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/claim_seller_payout_hold",
                "postgrest:POST:rpc/reserve_account_financial_operation",
                "postgrest:POST:rpc/complete_seller_payout_hold",
                "postgrest:POST:provider_exceptions",
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
            expect(harness.rest.rows("financial_operations")).toEqual([]);
            expect(harness.rest.rows("accounts")[0]).toMatchObject({
                risk_status: "manual_review",
                financial_hold_reason: "Seller recovery payout hold is not confirmed",
                payout_hold_claimed_by: null,
                payout_hold_claimed_at: null,
            });
            expect(harness.rest.rows("provider_exceptions")).toEqual([
                expect.objectContaining({
                    operation_id: null,
                    exception_type: "payout_schedule_update_ambiguous",
                    severity: "critical",
                    message: "simulated rpc/reserve_account_financial_operation POST failure",
                    details: providerExceptionDetails(userId, changeId, "daily"),
                }),
            ]);
        });
    });
}

function providerExceptionDetails(userId: string, changeId: string, interval: string, extra = {}): object {
    return {
        userId,
        payoutScheduleChangeId: changeId,
        requested: {
            cmsUserId: userId,
            stripeAccountId: `acct_payout_schedule_${userId.replace(/-/g, "_")}`,
            riskRevision: 0,
            interval,
            ...extra,
        },
    };
}

function ambiguousOrder(): string[] {
    return [
        "postgrest:POST:rpc/claim_seller_payout_hold",
        "postgrest:POST:rpc/reserve_account_financial_operation",
        "stripe:GET:/v1/balance_settings",
        "postgrest:PATCH:financial_operations",
        "stripe:POST:/v1/balance_settings",
        "postgrest:PATCH:financial_operations",
        "postgrest:POST:rpc/complete_seller_payout_hold",
        "postgrest:POST:provider_exceptions",
    ];
}
