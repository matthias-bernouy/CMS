import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import type { StripeBalance, StripeBalanceSettings } from "../../provider/types.ts";
import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { publicBalanceSettings } from "./payout-settings.ts";
import { publicAccount } from "./presentation.ts";

export function publicWalletBalances(balance: StripeBalance): JsonRecord[] {
    const amounts = new Map<
        string,
        {
            available: number;
            pending: number;
            instantAvailable: number;
            reserved: number;
        }
    >();
    const add = (entries: unknown, key: "available" | "pending" | "instantAvailable" | "reserved"): void => {
        if (!Array.isArray(entries)) {
            return;
        }
        for (const entry of entries) {
            if (!isRecord(entry) || typeof entry.currency !== "string" || !Number.isSafeInteger(entry.amount)) {
                continue;
            }
            const currency = entry.currency.toLowerCase();
            const current = amounts.get(currency) ?? { available: 0, pending: 0, instantAvailable: 0, reserved: 0 };
            current[key] += entry.amount as number;
            amounts.set(currency, current);
        }
    };

    add(balance.available, "available");
    add(balance.pending, "pending");
    add(balance.instant_available, "instantAvailable");
    add(balance.connect_reserved, "reserved");

    return Array.from(amounts.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, value]) => ({
            currency,
            available: value.available,
            pending: value.pending,
            total: value.available + value.pending,
            instantAvailable: value.instantAvailable,
            reserved: value.reserved,
        }));
}

export function publicSellerProviderRisk(
    account: ConnectAccountRow,
    balance: StripeBalance | null,
    balanceSettings: StripeBalanceSettings,
): JsonRecord {
    return {
        account: publicAccount(account),
        balances: balance ? publicWalletBalances(balance) : [],
        payoutControl: publicBalanceSettings(balanceSettings, account.payout_schedule),
        providerSnapshot: balanceSettings,
        refreshedAt: new Date().toISOString(),
    };
}
