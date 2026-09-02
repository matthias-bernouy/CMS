import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import { arrayAt, numberAt, stringArrayAt, stringAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export type SellerRestorationSettings = {
    interval: string;
    restoreKey: string;
    restoreRequest: JsonRecord;
};

export function sellerRestorationSettings(account: ConnectAccountRow, userId: string): SellerRestorationSettings {
    if (!account.manual_payout_hold_started_at || !account.manual_payout_hold_restore_settings) {
        throw new Error("Seller payout hold restoration snapshot is unavailable");
    }
    const snapshot = account.manual_payout_hold_restore_settings;
    const restoreSettingKeys = new Set([
        "interval",
        "weeklyPayoutDays",
        "monthlyPayoutDays",
        "minimumBalanceEur",
        "delayDaysOverride",
        "debitNegativeBalances",
    ]);
    if (Object.keys(snapshot).some((key) => !restoreSettingKeys.has(key))) {
        throw new Error("Seller payout hold restoration snapshot contains unsupported settings");
    }
    const interval = stringAt(snapshot, "interval");
    const minimumBalanceEur = numberAt(snapshot, "minimumBalanceEur");
    const weeklyPayoutDays = stringArrayAt(snapshot, "weeklyPayoutDays");
    const monthlyPayoutDays = arrayAt(snapshot, "monthlyPayoutDays").filter((value) => Number.isSafeInteger(value));
    if (
        !["manual", "daily", "weekly", "monthly"].includes(interval) ||
        !Number.isSafeInteger(minimumBalanceEur) ||
        minimumBalanceEur! < 0 ||
        (interval === "weekly" && weeklyPayoutDays.length === 0) ||
        (interval === "monthly" && monthlyPayoutDays.length === 0) ||
        (interval !== "weekly" && weeklyPayoutDays.length > 0) ||
        (interval !== "monthly" && monthlyPayoutDays.length > 0)
    ) {
        throw new Error("Seller payout hold restoration snapshot is invalid");
    }
    return {
        interval,
        restoreKey: `seller-risk-restore:${userId}:${account.risk_revision}:${account.manual_payout_hold_started_at}`,
        restoreRequest: {
            interval,
            minimumBalanceEur,
            ...(interval === "weekly" ? { weeklyPayoutDays } : {}),
            ...(interval === "monthly" ? { monthlyPayoutDays } : {}),
            ...(typeof snapshot.debitNegativeBalances === "boolean"
                ? { debitNegativeBalances: snapshot.debitNegativeBalances }
                : {}),
            ...(Number.isSafeInteger(snapshot.delayDaysOverride)
                ? { delayDaysOverride: snapshot.delayDaysOverride }
                : {}),
            reason: "Seller recovery exposure cleared",
        },
    };
}
