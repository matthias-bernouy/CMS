import {
    assertAllowedKeys,
    optionalBoolean,
    optionalNonNegativeInteger,
    optionalText,
    readJsonObject,
    requiredString,
} from "../../http/body/index.ts";
import { HttpError } from "../../http/errors.ts";
import { optionalMonthlyPayoutDays, optionalWeeklyPayoutDays, requiredPayoutInterval } from "../../http/payouts.ts";

export type SellerPayoutScheduleInput = {
    userId: string;
    payoutScheduleChangeId: string;
    interval: "manual" | "daily" | "weekly" | "monthly";
    weeklyPayoutDays: string[];
    monthlyPayoutDays: number[];
    minimumBalanceEur: number | null;
    delayDaysOverride: number | null;
    debitNegativeBalances: boolean | null;
    reason: string | null;
};

export async function readSellerPayoutScheduleInput(request: Request): Promise<SellerPayoutScheduleInput> {
    const body = await readJsonObject(request);
    assertAllowedKeys(body, [
        "userId",
        "payoutScheduleChangeId",
        "interval",
        "weeklyPayoutDays",
        "monthlyPayoutDays",
        "minimumBalanceEur",
        "delayDaysOverride",
        "debitNegativeBalances",
        "reason",
    ]);
    const userId = requiredString(body, "userId", 200);
    const payoutScheduleChangeId = requiredString(body, "payoutScheduleChangeId", 200);
    const interval = requiredPayoutInterval(body, "interval");
    const weeklyPayoutDays = optionalWeeklyPayoutDays(body, "weeklyPayoutDays");
    const monthlyPayoutDays = optionalMonthlyPayoutDays(body, "monthlyPayoutDays");
    const minimumBalanceEur = optionalNonNegativeInteger(body, "minimumBalanceEur");
    const delayDaysOverride = optionalNonNegativeInteger(body, "delayDaysOverride");
    const debitNegativeBalances = optionalBoolean(body, "debitNegativeBalances");
    const reason = optionalText(body, "reason", 500);
    if (delayDaysOverride !== null && delayDaysOverride > 31) {
        throw new HttpError(400, "delayDaysOverride must be between zero and 31");
    }
    if (interval === "weekly" && weeklyPayoutDays.length === 0) {
        throw new HttpError(400, "weeklyPayoutDays is required for a weekly payout schedule");
    }
    if (interval !== "weekly" && weeklyPayoutDays.length > 0) {
        throw new HttpError(400, "weeklyPayoutDays is allowed only for a weekly payout schedule");
    }
    if (interval === "monthly" && monthlyPayoutDays.length === 0) {
        throw new HttpError(400, "monthlyPayoutDays is required for a monthly payout schedule");
    }
    if (interval !== "monthly" && monthlyPayoutDays.length > 0) {
        throw new HttpError(400, "monthlyPayoutDays is allowed only for a monthly payout schedule");
    }
    return {
        userId,
        payoutScheduleChangeId,
        interval,
        weeklyPayoutDays,
        monthlyPayoutDays,
        minimumBalanceEur,
        delayDaysOverride,
        debitNegativeBalances,
        reason,
    };
}
