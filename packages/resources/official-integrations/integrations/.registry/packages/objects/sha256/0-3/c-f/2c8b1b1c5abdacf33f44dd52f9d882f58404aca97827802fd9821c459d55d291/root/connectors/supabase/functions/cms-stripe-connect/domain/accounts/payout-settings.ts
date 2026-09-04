import type { StripeBalanceSettings } from "../../provider/types.ts";
import { arrayAt, objectAt, stringArrayAt, stringAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export function publicBalanceSettings(
    balanceSettings: StripeBalanceSettings,
    fallbackInterval = "stripe_default",
): JsonRecord {
    const payments = objectAt(balanceSettings, "payments");
    const payouts = objectAt(payments, "payouts");
    const schedule = objectAt(payouts, "schedule");
    const settlementTiming = objectAt(payments, "settlement_timing");
    return {
        interval: stringAt(schedule, "interval") || fallbackInterval,
        weeklyPayoutDays: stringArrayAt(schedule, "weekly_payout_days"),
        monthlyPayoutDays: arrayAt(schedule, "monthly_payout_days").filter((value): value is number =>
            Number.isSafeInteger(value),
        ),
        minimumBalanceByCurrency: objectAt(payouts, "minimum_balance_by_currency"),
        debitNegativeBalances:
            typeof payments.debit_negative_balances === "boolean" ? payments.debit_negative_balances : null,
        delayDays: Number.isSafeInteger(settlementTiming.delay_days) ? settlementTiming.delay_days : null,
        delayDaysOverride: Number.isSafeInteger(settlementTiming.delay_days_override)
            ? settlementTiming.delay_days_override
            : null,
        status: stringAt(payouts, "status") || null,
    };
}

export function balanceSettingsMatchRequest(settings: StripeBalanceSettings, request: JsonRecord): boolean {
    const payments = objectAt(settings, "payments");
    const payouts = objectAt(payments, "payouts");
    const schedule = objectAt(payouts, "schedule");
    if (stringAt(schedule, "interval") !== request.interval) {
        return false;
    }
    if (Array.isArray(request.weeklyPayoutDays)) {
        if (!sameScalarSet(stringArrayAt(schedule, "weekly_payout_days"), request.weeklyPayoutDays)) {
            return false;
        }
    }
    if (Array.isArray(request.monthlyPayoutDays)) {
        const actual = arrayAt(schedule, "monthly_payout_days").filter((value) => Number.isSafeInteger(value));
        if (!sameScalarSet(actual, request.monthlyPayoutDays)) {
            return false;
        }
    }
    if (Number.isSafeInteger(request.minimumBalanceEur)) {
        const providerMinimum = objectAt(payouts, "minimum_balance_by_currency").eur;
        const normalizedProviderMinimum =
            providerMinimum === null || providerMinimum === undefined ? 0 : providerMinimum;
        if (normalizedProviderMinimum !== request.minimumBalanceEur) {
            return false;
        }
    }
    if (Number.isSafeInteger(request.delayDaysOverride)) {
        if (objectAt(payments, "settlement_timing").delay_days_override !== request.delayDaysOverride) {
            return false;
        }
    }
    if (typeof request.debitNegativeBalances === "boolean") {
        if (payments.debit_negative_balances !== request.debitNegativeBalances) {
            return false;
        }
    }
    return true;
}

function sameScalarSet(left: unknown[], right: unknown[]): boolean {
    const normalize = (values: unknown[]) => values.map(String).sort();
    return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
