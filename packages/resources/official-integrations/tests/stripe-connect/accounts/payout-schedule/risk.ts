import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateAccountHandlerHarness, type JsonRecord, responseBody } from "../harness";

const userId = "seller-payout-manual-risk";
const stripeAccountId = "acct_payout_schedule_seller_payout_manual_risk";
const command = {
    userId,
    payoutScheduleChangeId: "manual-risk-1",
    interval: "manual",
    minimumBalanceEur: 500,
    debitNegativeBalances: true,
};

export function registerPayoutScheduleRiskContracts(createHarness: CreateAccountHandlerHarness): void {
    describe("stripe-connect seller payout schedule risk races", () => {
        test("returns the protected manual schedule when concurrent risk supersedes configuration", async () => {
            const harness = await createHarness();
            harness.rest.seedPayoutScheduleAccount(userId, true);
            clearRequests(harness);
            const pause = harness.rest.pauseNextSellerBalanceSettingsUpdate();

            const configuring = harness.submit("system", undefined, "configureSellerPayoutSchedule", command);
            await pause.entered;
            harness.rest.exposeSellerFinancialRisk(userId, 500);
            pause.resume();
            const response = await configuring;
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedResponse(body));
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/claim_seller_payout_hold",
                "postgrest:POST:rpc/reserve_account_financial_operation",
                "stripe:GET:/v1/balance_settings",
                "postgrest:PATCH:financial_operations",
                "stripe:POST:/v1/balance_settings",
                "postgrest:POST:rpc/finalize_seller_payout_configuration",
                "stripe:GET:/v1/balance_settings",
                "postgrest:POST:rpc/reserve_account_financial_operation",
                "postgrest:PATCH:financial_operations",
                "postgrest:POST:rpc/complete_seller_payout_hold",
                "postgrest:GET:accounts",
                "stripe:GET:/v1/balance_settings",
                "postgrest:PATCH:financial_operations",
            ]);
            expect(harness.rest.balanceSettingsUpdateCount).toBe(1);
            expect(harness.rest.rows("financial_operations")).toEqual([
                expect.objectContaining({ id: 1, status: "succeeded", attempt_count: 1 }),
                expect.objectContaining({ id: 2, status: "succeeded", attempt_count: 0 }),
            ]);
        });
    });
}

function expectedResponse(body: JsonRecord): JsonRecord {
    const account = body.account as JsonRecord;
    return {
        account: {
            userId,
            stripeAccountId,
            payoutSchedule: "manual",
            riskStatus: "restricted",
            financialHoldReason: "Seller recovery exposure blocks payments and payouts",
            payoutsEnabled: true,
            outstandingDebtAmount: 0,
            financialExposureAmount: 500,
            payoutBlockedAt: String(account.payoutBlockedAt),
            manualPayoutHoldStartedAt: String(account.manualPayoutHoldStartedAt),
            manualPayoutHoldAlertAt: String(account.manualPayoutHoldAlertAt),
            manualPayoutHoldDeadlineAt: String(account.manualPayoutHoldDeadlineAt),
        },
        balances: [],
        payoutControl: {
            interval: "manual",
            weeklyPayoutDays: [],
            monthlyPayoutDays: [],
            minimumBalanceByCurrency: { eur: 500 },
            debitNegativeBalances: true,
            delayDays: 2,
            delayDaysOverride: 0,
            status: "enabled",
        },
        providerSnapshot: {
            object: "balance_settings",
            payments: {
                debit_negative_balances: true,
                payouts: {
                    minimum_balance_by_currency: { eur: 500 },
                    schedule: { interval: "manual", weekly_payout_days: [], monthly_payout_days: [] },
                    status: "enabled",
                },
                settlement_timing: { delay_days: 2, delay_days_override: 0 },
            },
        },
        refreshedAt: String(body.refreshedAt),
        providerOperationId: 1,
        payoutScheduleChangeId: command.payoutScheduleChangeId,
    };
}
