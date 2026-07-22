import type { JsonRecord } from "../harness";

export const payoutUserId = "seller-payout-contract";
export const stripeAccountId = "acct_payout_schedule_seller_payout_contract";
export const payoutCommand = {
    userId: payoutUserId,
    payoutScheduleChangeId: "payout-contract-1",
    interval: "weekly",
    weeklyPayoutDays: ["monday"],
    minimumBalanceEur: 2500,
    delayDaysOverride: 7,
    debitNegativeBalances: true,
    reason: "Contract payout schedule",
};

export function expectedPayoutResponse(dynamic: { refreshedAt: string; providerOperationId: number }): JsonRecord {
    const providerSnapshot = {
        object: "balance_settings",
        payments: {
            debit_negative_balances: true,
            payouts: {
                minimum_balance_by_currency: { eur: 2500 },
                schedule: {
                    interval: "weekly",
                    weekly_payout_days: ["monday"],
                    monthly_payout_days: [],
                },
                status: "enabled",
            },
            settlement_timing: { delay_days: 2, delay_days_override: 7 },
        },
    };
    return {
        account: {
            userId: payoutUserId,
            stripeAccountId,
            payoutSchedule: "weekly",
            riskStatus: "standard",
            financialHoldReason: null,
            payoutsEnabled: true,
            outstandingDebtAmount: 0,
            financialExposureAmount: 0,
            payoutBlockedAt: null,
            manualPayoutHoldStartedAt: null,
            manualPayoutHoldAlertAt: null,
            manualPayoutHoldDeadlineAt: null,
        },
        balances: [],
        payoutControl: {
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            monthlyPayoutDays: [],
            minimumBalanceByCurrency: { eur: 2500 },
            debitNegativeBalances: true,
            delayDays: 2,
            delayDaysOverride: 7,
            status: "enabled",
        },
        providerSnapshot,
        refreshedAt: dynamic.refreshedAt,
        providerOperationId: dynamic.providerOperationId,
        payoutScheduleChangeId: "payout-contract-1",
    };
}
