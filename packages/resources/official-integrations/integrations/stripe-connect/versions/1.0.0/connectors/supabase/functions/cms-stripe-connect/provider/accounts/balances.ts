import { arrayAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { stripeV1 } from "../stripe-client.ts";
import type { StripeBalance, StripeBalanceSettings } from "../types.ts";

export async function retrieveConnectedBalance(stripeAccountId: string): Promise<StripeBalance> {
    return await stripeV1<StripeBalance>("/balance", {
        method: "GET",
        headers: { "stripe-account": stripeAccountId },
    });
}

export async function retrieveConnectedBalanceSettings(stripeAccountId: string): Promise<StripeBalanceSettings> {
    return await stripeV1<StripeBalanceSettings>("/balance_settings", {
        method: "GET",
        headers: { "stripe-account": stripeAccountId },
    });
}

export async function retrievePlatformBalanceSettings(): Promise<StripeBalanceSettings> {
    return await stripeV1<StripeBalanceSettings>("/balance_settings", { method: "GET" });
}

export async function updateBalanceSettings(
    stripeAccountId: string | null,
    request: JsonRecord,
    idempotencyKey: string,
): Promise<StripeBalanceSettings> {
    const params = new URLSearchParams();
    params.set("payments[payouts][schedule][interval]", String(request.interval));
    for (const day of arrayAt(request, "weeklyPayoutDays")) {
        params.append("payments[payouts][schedule][weekly_payout_days][]", String(day));
    }
    for (const day of arrayAt(request, "monthlyPayoutDays")) {
        params.append("payments[payouts][schedule][monthly_payout_days][]", String(day));
    }
    if (Number.isSafeInteger(request.minimumBalanceEur)) {
        params.set("payments[payouts][minimum_balance_by_currency][eur]", String(request.minimumBalanceEur));
    }
    if (Number.isSafeInteger(request.delayDaysOverride)) {
        params.set("payments[settlement_timing][delay_days_override]", String(request.delayDaysOverride));
    }
    if (typeof request.debitNegativeBalances === "boolean") {
        params.set("payments[debit_negative_balances]", String(request.debitNegativeBalances));
    }
    const headers = stripeAccountId ? { "stripe-account": stripeAccountId } : undefined;
    return await stripeV1<StripeBalanceSettings>(
        "/balance_settings",
        {
            method: "POST",
            headers,
            body: params,
        },
        { idempotencyKey },
    );
}
