import { getRowByField } from "../../../db/postgrest.ts";
import type { PlatformPayoutControlRow } from "../../../db/records/operations.ts";
import { HttpError } from "../../../http/errors.ts";
import { retrievePlatformBalanceSettings } from "../../../provider/accounts/balances.ts";
import { protectedPlatformPayoutInterval } from "../../../shared/runtime.ts";
import { numberAt, objectAt, stringAt } from "../../../shared/data.ts";

export async function assertPlatformPayoutProtection(): Promise<void> {
    const [settings, control] = await Promise.all([
        retrievePlatformBalanceSettings(),
        getRowByField<PlatformPayoutControlRow>("platform_payout_controls", "control_key", "default", "*"),
    ]);
    if (!control) {
        throw new HttpError(503, "platform payout protection state is unavailable");
    }
    const interval = stringAt(objectAt(objectAt(objectAt(settings, "payments"), "payouts"), "schedule"), "interval");
    if (interval !== protectedPlatformPayoutInterval) {
        throw new HttpError(503, "protected payments require the configured automatic Stripe platform payout schedule");
    }
    const providerMinimum =
        numberAt(objectAt(objectAt(objectAt(settings, "payments"), "payouts"), "minimum_balance_by_currency"), "eur") ??
        0;
    if (providerMinimum < control.required_minimum_amount || providerMinimum < control.provider_minimum_amount) {
        throw new HttpError(503, "protected payments require the current Stripe platform minimum balance");
    }
}
