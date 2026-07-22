import { sellerPayoutHoldRpc } from "../../../db/repositories/payout-controls.ts";
import type { ConnectAccountRow } from "../../../db/records/accounts.ts";
import type { FinancialOperationRow } from "../../../db/records/operations.ts";
import type { StripeBalanceSettings } from "../../../provider/types.ts";
import { numberAt, objectAt } from "../../../shared/data.ts";
import type { JsonRecord } from "../../../shared/types.ts";

type ApplySellerHold = (userId: string, owner: string, claim: JsonRecord) => Promise<boolean>;
type RestoreSellerSchedule = (userId: string) => Promise<boolean>;

export async function recoverSellerRiskHold(
    operation: FinancialOperationRow,
    cmsUserId: string,
    owner: string,
    claim: JsonRecord,
    account: ConnectAccountRow,
    current: StripeBalanceSettings,
    applyHold: ApplySellerHold,
    restoreSchedule: RestoreSellerSchedule,
): Promise<boolean> {
    if (account.outstanding_debt_amount + account.financial_exposure_amount > 0) {
        return await applyHold(cmsUserId, owner, claim);
    }
    if (!account.manual_payout_hold_started_at || !account.manual_payout_hold_restore_settings) {
        const currentMinimum =
            numberAt(
                objectAt(objectAt(objectAt(current, "payments"), "payouts"), "minimum_balance_by_currency"),
                "eur",
            ) ?? 0;
        const completed = await sellerPayoutHoldRpc("complete_seller_payout_hold", {
            p_seller_cms_user_id: cmsUserId,
            p_owner: owner,
            p_expected_risk_revision: account.risk_revision,
            p_applied_minimum_amount: currentMinimum,
            p_succeeded: true,
            p_error: null,
            p_restore_settings: objectAt(operation.request, "restoreSettings"),
        });
        if (completed.accepted !== true) {
            throw new Error("seller payout hold recovery lease was superseded");
        }
        return completed.needsReapply === true
            ? await applyHold(cmsUserId, owner, { claimed: true, account: objectAt(completed, "account") })
            : await restoreSchedule(cmsUserId);
    }
    const cancelled = await sellerPayoutHoldRpc("cancel_seller_payout_configuration", {
        p_seller_cms_user_id: cmsUserId,
        p_owner: owner,
        p_expected_risk_revision: account.risk_revision,
    });
    if (cancelled.accepted !== true) {
        throw new Error("seller payout hold recovery lease was superseded");
    }
    return cancelled.superseded === true
        ? await applyHold(cmsUserId, owner, cancelled)
        : await restoreSchedule(cmsUserId);
}
