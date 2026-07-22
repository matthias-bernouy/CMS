import { resolveProviderException, upsertProviderException } from "../../db/repositories/events-exceptions.ts";
import {
    reserveAccountFinancialOperation,
    updateFinancialOperation,
} from "../../db/repositories/financial-operations.ts";
import { sellerPayoutHoldRpc } from "../../db/repositories/payout-controls.ts";
import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import type { FinancialOperationRow } from "../../db/records/operations.ts";
import { balanceSettingsMatchRequest } from "../../domain/accounts/payout-settings.ts";
import { retrieveConnectedBalanceSettings, updateBalanceSettings } from "../../provider/accounts/balances.ts";
import { stableStripeIdempotencyKey } from "../../shared/crypto.ts";
import { errorMessage, objectAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import type { ApplySellerRecoveryPayoutHold } from "./seller-hold.ts";
import { sellerRestorationSettings } from "./seller-restoration-settings.ts";

type SellerPayoutRestorationDependencies = {
    sellerRiskAccount(result: JsonRecord): ConnectAccountRow;
    applyClaimedSellerRecoveryPayoutHold: ApplySellerRecoveryPayoutHold;
};

export type RestoreSellerAutomaticPayoutSchedule = (userId: string) => Promise<boolean>;

export function createSellerPayoutRestoration({
    sellerRiskAccount,
    applyClaimedSellerRecoveryPayoutHold,
}: SellerPayoutRestorationDependencies): RestoreSellerAutomaticPayoutSchedule {
    return async function restoreSellerAutomaticPayoutSchedule(userId) {
        const owner = crypto.randomUUID();
        const claim = await sellerPayoutHoldRpc("claim_seller_payout_hold", {
            p_seller_cms_user_id: userId,
            p_owner: owner,
            p_require_risk: false,
        });
        if (claim.claimed !== true) {
            return false;
        }
        const account = sellerRiskAccount(claim);
        if (account.outstanding_debt_amount + account.financial_exposure_amount > 0) {
            return await applyClaimedSellerRecoveryPayoutHold(userId, owner, claim);
        }

        let operation: FinancialOperationRow | null = null;
        try {
            if (!account.stripe_account_id) {
                throw new Error("Seller Stripe account is unavailable");
            }
            const settings = sellerRestorationSettings(account, userId);
            operation = await reserveAccountFinancialOperation(userId, {
                businessKey: settings.restoreKey,
                operationType: "payout_schedule_update",
                request: {
                    cmsUserId: userId,
                    stripeAccountId: account.stripe_account_id,
                    riskRevision: account.risk_revision,
                    manualPayoutHoldStartedAt: account.manual_payout_hold_started_at,
                    ...settings.restoreRequest,
                },
            });
            let provider = await retrieveConnectedBalanceSettings(account.stripe_account_id);
            if (!balanceSettingsMatchRequest(provider, settings.restoreRequest)) {
                await updateFinancialOperation(operation.id, {
                    status: "processing",
                    claimed_at: new Date().toISOString(),
                    attempt_count: operation.attempt_count + 1,
                });
                try {
                    provider = await updateBalanceSettings(
                        account.stripe_account_id,
                        settings.restoreRequest,
                        await stableStripeIdempotencyKey("payout-schedule", settings.restoreKey),
                    );
                } catch (updateError) {
                    const recovered = await retrieveConnectedBalanceSettings(account.stripe_account_id).catch(
                        () => null,
                    );
                    if (!recovered || !balanceSettingsMatchRequest(recovered, settings.restoreRequest)) {
                        throw updateError;
                    }
                    provider = recovered;
                }
            }
            if (!balanceSettingsMatchRequest(provider, settings.restoreRequest)) {
                throw new Error("Stripe did not confirm the automatic seller payout schedule restoration");
            }
            await updateFinancialOperation(operation.id, {
                status: "succeeded",
                response: provider,
                last_error: null,
                completed_at: new Date().toISOString(),
            });
            const finalized = await sellerPayoutHoldRpc("finalize_seller_payout_configuration", {
                p_seller_cms_user_id: userId,
                p_owner: owner,
                p_expected_risk_revision: account.risk_revision,
                p_interval: settings.interval,
            });
            if (finalized.accepted !== true) {
                return false;
            }
            if (finalized.superseded === true) {
                return await applyClaimedSellerRecoveryPayoutHold(userId, owner, {
                    claimed: true,
                    account: objectAt(finalized, "account"),
                });
            }
            await resolveProviderException(`seller-payout-restore:${userId}`);
            return true;
        } catch (error) {
            const message = `Could not restore the automatic seller payout schedule: ${errorMessage(error)}`;
            if (operation) {
                await updateFinancialOperation(operation.id, {
                    status: "manual_review",
                    last_error: message,
                }).catch(() => null);
            }
            const cancelled = await sellerPayoutHoldRpc("cancel_seller_payout_configuration", {
                p_seller_cms_user_id: userId,
                p_owner: owner,
                p_expected_risk_revision: account.risk_revision,
            }).catch(() => null);
            if (cancelled?.accepted === true && cancelled.superseded === true) {
                await applyClaimedSellerRecoveryPayoutHold(userId, owner, {
                    claimed: true,
                    account: objectAt(cancelled, "account"),
                }).catch(() => false);
            }
            await upsertProviderException(`seller-payout-restore:${userId}`, {
                operation_id: operation?.id ?? null,
                exception_type: "seller_payout_schedule_restore_failed",
                severity: "critical",
                message,
                details: {
                    userId,
                    stripeAccountId: account.stripe_account_id,
                    manualPayoutHoldDeadlineAt: account.manual_payout_hold_deadline_at,
                },
            }).catch(() => null);
            return false;
        }
    };
}
