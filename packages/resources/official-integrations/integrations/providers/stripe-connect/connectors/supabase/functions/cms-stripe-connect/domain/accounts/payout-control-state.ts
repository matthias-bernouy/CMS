import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import type { PlatformPayoutControlRow } from "../../db/records/operations.ts";
import { objectAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export function platformPayoutControl(result: JsonRecord): PlatformPayoutControlRow {
    const control = objectAt(result, "control") as unknown as PlatformPayoutControlRow;
    if (
        control.control_key !== "default" ||
        !Number.isSafeInteger(control.liability_revision) ||
        !Number.isSafeInteger(control.required_minimum_amount) ||
        !Number.isSafeInteger(control.provider_minimum_amount)
    ) {
        throw new Error("Platform payout protection RPC returned invalid state");
    }
    return control;
}

export function sellerRiskAccount(result: JsonRecord): ConnectAccountRow {
    const account = objectAt(result, "account") as unknown as ConnectAccountRow;
    if (!account.cms_user_id) {
        throw new Error("Seller payout hold RPC returned no account");
    }
    return account;
}
