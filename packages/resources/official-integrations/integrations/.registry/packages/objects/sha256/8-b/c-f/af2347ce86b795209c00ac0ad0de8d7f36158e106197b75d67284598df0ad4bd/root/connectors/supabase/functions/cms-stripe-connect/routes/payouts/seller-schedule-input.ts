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
        "payoutSchedule",
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
    const configuredSchedule = optionalText(body, "payoutSchedule", 200);
    const hasLegacySchedule =
        body.interval !== undefined || body.weeklyPayoutDays !== undefined || body.monthlyPayoutDays !== undefined;
    if (configuredSchedule && hasLegacySchedule) {
        throw new HttpError(
            400,
            "payoutSchedule cannot be combined with interval, weeklyPayoutDays, or monthlyPayoutDays",
        );
    }
    const schedule = configuredSchedule
        ? parseConfiguredPayoutSchedule(configuredSchedule)
        : {
              interval: requiredPayoutInterval(body, "interval"),
              weeklyPayoutDays: optionalWeeklyPayoutDays(body, "weeklyPayoutDays"),
              monthlyPayoutDays: optionalMonthlyPayoutDays(body, "monthlyPayoutDays"),
          };
    const { interval, weeklyPayoutDays, monthlyPayoutDays } = schedule;
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

function parseConfiguredPayoutSchedule(value: string): {
    interval: SellerPayoutScheduleInput["interval"];
    weeklyPayoutDays: string[];
    monthlyPayoutDays: number[];
} {
    if (value === "daily" || value === "manual") {
        return { interval: value, weeklyPayoutDays: [], monthlyPayoutDays: [] };
    }
    const [interval, days, unexpected] = value.split(":");
    if (unexpected !== undefined || !days) {
        throw invalidConfiguredPayoutSchedule();
    }
    const entries = days.split(",").map((entry) => entry.trim());
    if (entries.some((entry) => !entry)) {
        throw invalidConfiguredPayoutSchedule();
    }
    if (interval === "weekly") {
        return {
            interval,
            weeklyPayoutDays: optionalWeeklyPayoutDays({ payoutSchedule: entries }, "payoutSchedule"),
            monthlyPayoutDays: [],
        };
    }
    if (interval === "monthly") {
        if (entries.some((entry) => !/^(?:[1-9]|[12][0-9]|3[01])$/.test(entry))) {
            throw invalidConfiguredPayoutSchedule();
        }
        return {
            interval,
            weeklyPayoutDays: [],
            monthlyPayoutDays: optionalMonthlyPayoutDays({ payoutSchedule: entries.map(Number) }, "payoutSchedule"),
        };
    }
    throw invalidConfiguredPayoutSchedule();
}

function invalidConfiguredPayoutSchedule(): HttpError {
    return new HttpError(400, "payoutSchedule must be daily, manual, weekly:<weekdays>, or monthly:<days-of-month>");
}
