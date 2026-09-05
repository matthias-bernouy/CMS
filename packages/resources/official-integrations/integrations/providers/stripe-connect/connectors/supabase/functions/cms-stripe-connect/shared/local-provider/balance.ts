import type { JsonRecord } from "../types.ts";

export function localBalanceSettings(): JsonRecord {
    return {
        payments: {
            payouts: { schedule: { interval: "daily" }, minimum_balance_by_currency: { eur: 0 }, status: "active" },
            settlement_timing: { delay_days: 2 },
            debit_negative_balances: true,
        },
    };
}

export function applyBalanceSettings(current: JsonRecord, body: URLSearchParams): JsonRecord {
    const payments = structuredClone(current.payments) as JsonRecord;
    const payouts = payments.payouts as JsonRecord;
    const schedule = payouts.schedule as JsonRecord;
    schedule.interval = body.get("payments[payouts][schedule][interval]") ?? schedule.interval;
    const minimum = body.get("payments[payouts][minimum_balance_by_currency][eur]");
    if (minimum !== null) {
        (payouts.minimum_balance_by_currency as JsonRecord).eur = Number(minimum);
    }
    const delay = body.get("payments[settlement_timing][delay_days_override]");
    if (delay !== null) {
        (payments.settlement_timing as JsonRecord).delay_days_override = Number(delay);
    }
    const debit = body.get("payments[debit_negative_balances]");
    if (debit !== null) {
        payments.debit_negative_balances = debit === "true";
    }
    return { payments };
}
