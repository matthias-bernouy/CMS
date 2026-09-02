import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import type { StripeBalanceSettings } from "../../provider/types.ts";
import { arrayAt, numberAt, objectAt, stringArrayAt, stringAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export type SellerHoldSettings = {
    restoreSettings: JsonRecord;
    appliedMinimum: number;
    holdRequest: JsonRecord;
};

export function sellerHoldSettings(
    account: ConnectAccountRow,
    current: StripeBalanceSettings,
    requiredHold: number,
): SellerHoldSettings {
    const currentPayments = objectAt(current, "payments");
    const currentSchedule = objectAt(objectAt(currentPayments, "payouts"), "schedule");
    const currentMinimum =
        numberAt(objectAt(objectAt(currentPayments, "payouts"), "minimum_balance_by_currency"), "eur") ?? 0;
    const currentInterval = stringAt(currentSchedule, "interval");
    if (!["manual", "daily", "weekly", "monthly"].includes(currentInterval)) {
        throw new Error("Seller payout baseline has an unsupported interval");
    }
    const weeklyPayoutDays = stringArrayAt(currentSchedule, "weekly_payout_days");
    const monthlyPayoutDays = arrayAt(currentSchedule, "monthly_payout_days").filter((value) =>
        Number.isSafeInteger(value),
    );
    if (
        (currentInterval === "weekly" && weeklyPayoutDays.length === 0) ||
        (currentInterval === "monthly" && monthlyPayoutDays.length === 0)
    ) {
        throw new Error("Seller payout baseline is missing its scheduled payout days");
    }
    const restoreSettings = account.manual_payout_hold_restore_settings ?? {
        interval: currentInterval,
        ...(currentInterval === "weekly" ? { weeklyPayoutDays } : {}),
        ...(currentInterval === "monthly" ? { monthlyPayoutDays } : {}),
        minimumBalanceEur: currentMinimum,
        debitNegativeBalances: currentPayments.debit_negative_balances === true,
        ...(Number.isSafeInteger(objectAt(currentPayments, "settlement_timing").delay_days_override)
            ? { delayDaysOverride: objectAt(currentPayments, "settlement_timing").delay_days_override }
            : {}),
    };
    const appliedMinimum = Math.max(requiredHold, account.provider_hold_minimum_amount, currentMinimum);
    return {
        restoreSettings,
        appliedMinimum,
        holdRequest: {
            interval: "manual",
            minimumBalanceEur: appliedMinimum,
            debitNegativeBalances: true,
            reason: "Seller recovery exposure hold",
        },
    };
}
