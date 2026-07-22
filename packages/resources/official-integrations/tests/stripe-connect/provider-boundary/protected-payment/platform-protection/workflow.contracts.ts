import { describe, expect, test } from "bun:test";
import {
    clearRequests,
    type CreateProviderBoundaryHarness,
    postgrestBody,
    postgrestBudget,
    responseBody,
} from "../../harness";
import { directSubmit } from "./validation.contracts";

const command = {
    platformPayoutControlChangeId: "platform-workflow",
    minimumBalanceEur: 275,
    liabilityRevision: 1,
    delayDaysOverride: 7,
    debitNegativeBalances: false,
    reason: "Protected marketplace liability",
};

export function registerPlatformPayoutProtectionWorkflowContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect platform payout protection workflow contracts", () => {
        test("keeps the exact DTO and provider/database order across success and replay", async () => {
            const harness = await createHarness();

            const response = await directSubmit(harness, command);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedResponse());
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/claim_platform_payout_protection",
                "stripe:GET:/v1/balance_settings",
                "postgrest:POST:rpc/reserve_platform_financial_operation",
                "postgrest:PATCH:financial_operations",
                "stripe:POST:/v1/balance_settings",
                "postgrest:PATCH:financial_operations",
                "postgrest:POST:rpc/complete_platform_payout_protection",
            ]);
            expect(postgrestBudget(harness)).toEqual([
                { method: "POST", table: "rpc/claim_platform_payout_protection" },
                { method: "POST", table: "rpc/reserve_platform_financial_operation" },
                { method: "PATCH", table: "financial_operations" },
                { method: "PATCH", table: "financial_operations" },
                { method: "POST", table: "rpc/complete_platform_payout_protection" },
            ]);
            expect(postgrestBody(harness, 1)).toEqual({
                p_business_key: expect.stringMatching(/^platform-payout-protection:1:275:[0-9a-f]{64}$/),
                p_operation_type: "payout_schedule_update",
                p_request: {
                    scope: "platform",
                    interval: "daily",
                    minimumBalanceEur: 275,
                    delayDaysOverride: 7,
                    debitNegativeBalances: false,
                    reason: "Protected marketplace liability",
                    commerceLiabilityRevision: 1,
                },
            });
            expect(harness.rest.stripeRequests).toEqual([
                {
                    method: "GET",
                    pathname: "/v1/balance_settings",
                    searchParams: [],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
                {
                    method: "POST",
                    pathname: "/v1/balance_settings",
                    searchParams: [],
                    idempotencyKey: expect.stringMatching(/^cms:platform-payout-protection:[0-9a-f]{64}$/),
                    stripeAccount: null,
                },
            ]);

            clearRequests(harness);
            const replay = await directSubmit(harness, command);

            expect(replay.status).toBe(200);
            expect(await responseBody(replay)).toEqual(expectedResponse());
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/claim_platform_payout_protection",
                "stripe:GET:/v1/balance_settings",
                "postgrest:POST:rpc/reserve_platform_financial_operation",
                "postgrest:POST:rpc/complete_platform_payout_protection",
            ]);
            expect(harness.rest.balanceSettingsUpdateCount).toBe(1);
        });
    });
}

function expectedResponse() {
    const providerSnapshot = {
        object: "balance_settings",
        payments: {
            debit_negative_balances: false,
            payouts: {
                minimum_balance_by_currency: { eur: 275 },
                schedule: { interval: "daily", weekly_payout_days: [], monthly_payout_days: [] },
                status: "enabled",
            },
            settlement_timing: { delay_days: 2, delay_days_override: 7 },
        },
    };
    return {
        platformPayoutControlChangeId: "platform-workflow",
        providerOperationId: 1,
        liabilityRevision: 1,
        appliedMinimumBalanceEur: 275,
        decreaseAuthorizationId: null,
        payoutControl: {
            interval: "daily",
            weeklyPayoutDays: [],
            monthlyPayoutDays: [],
            minimumBalanceByCurrency: { eur: 275 },
            debitNegativeBalances: false,
            delayDays: 2,
            delayDaysOverride: 7,
            status: "enabled",
        },
        providerSnapshot,
    };
}
