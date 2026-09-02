import { upsertProviderException } from "../../db/repositories/events-exceptions.ts";
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
import { sellerHoldSettings } from "./seller-hold-settings.ts";

type SellerPayoutHoldDependencies = {
    sellerRiskAccount(result: JsonRecord): ConnectAccountRow;
};

export type ApplySellerRecoveryPayoutHold = (
    userId: string,
    owner: string,
    initialClaim: JsonRecord,
) => Promise<boolean>;

export type EnforceSellerRecoveryPayoutHold = (userId: string) => Promise<boolean>;

export function createSellerRecoveryPayoutHold({ sellerRiskAccount }: SellerPayoutHoldDependencies): {
    applyClaimedSellerRecoveryPayoutHold: ApplySellerRecoveryPayoutHold;
    enforceSellerRecoveryPayoutHold: EnforceSellerRecoveryPayoutHold;
} {
    async function applyClaimedSellerRecoveryPayoutHold(
        userId: string,
        owner: string,
        initialClaim: JsonRecord,
    ): Promise<boolean> {
        let claim = initialClaim;
        for (let attempt = 0; attempt < 5; attempt++) {
            const account = sellerRiskAccount(claim);
            const requiredHold = account.outstanding_debt_amount + account.financial_exposure_amount;
            let operation: FinancialOperationRow | null = null;
            let appliedMinimum = account.provider_hold_minimum_amount;
            const holdKey = `seller-risk-hold:${userId}:${account.risk_revision}:${account.payout_hold_claimed_at ?? owner}`;
            try {
                if (!account.stripe_account_id) {
                    throw new Error("Seller Stripe account is unavailable");
                }
                const current = await retrieveConnectedBalanceSettings(account.stripe_account_id);
                const settings = sellerHoldSettings(account, current, requiredHold);
                appliedMinimum = settings.appliedMinimum;
                operation = await reserveAccountFinancialOperation(userId, {
                    businessKey: holdKey,
                    operationType: "payout_schedule_update",
                    request: {
                        cmsUserId: userId,
                        stripeAccountId: account.stripe_account_id,
                        restoreSettings: settings.restoreSettings,
                        ...settings.holdRequest,
                    },
                });
                let provider = current;
                if (!balanceSettingsMatchRequest(current, settings.holdRequest)) {
                    await updateFinancialOperation(operation.id, {
                        status: "processing",
                        claimed_at: new Date().toISOString(),
                        attempt_count: operation.attempt_count + 1,
                    });
                    provider = await updateBalanceSettings(
                        account.stripe_account_id,
                        settings.holdRequest,
                        await stableStripeIdempotencyKey("payout-schedule", holdKey),
                    );
                }
                if (!balanceSettingsMatchRequest(provider, settings.holdRequest)) {
                    throw new Error("Stripe did not confirm the required seller payout hold");
                }
                if (operation.status !== "succeeded" || provider !== current) {
                    await updateFinancialOperation(operation.id, {
                        status: "succeeded",
                        response: provider,
                        last_error: null,
                        completed_at: new Date().toISOString(),
                    });
                }
                const completed = await sellerPayoutHoldRpc("complete_seller_payout_hold", {
                    p_seller_cms_user_id: userId,
                    p_owner: owner,
                    p_expected_risk_revision: account.risk_revision,
                    p_applied_minimum_amount: appliedMinimum,
                    p_succeeded: true,
                    p_error: null,
                    p_restore_settings: settings.restoreSettings,
                });
                if (completed.accepted !== true) {
                    return false;
                }
                if (completed.needsReapply !== true) {
                    return true;
                }
                claim = { claimed: true, account: objectAt(completed, "account") };
            } catch (error) {
                const message = `Could not enforce Stripe seller payout hold: ${errorMessage(error)}`;
                if (operation) {
                    await updateFinancialOperation(operation.id, {
                        status: "manual_review",
                        last_error: message,
                    }).catch(() => null);
                }
                await sellerPayoutHoldRpc("complete_seller_payout_hold", {
                    p_seller_cms_user_id: userId,
                    p_owner: owner,
                    p_expected_risk_revision: account.risk_revision,
                    p_applied_minimum_amount: appliedMinimum,
                    p_succeeded: false,
                    p_error: message,
                }).catch(() => null);
                await upsertProviderException(`seller-payout-hold:${holdKey}`, {
                    operation_id: operation?.id ?? null,
                    exception_type: "seller_payout_hold_failed",
                    severity: "critical",
                    message,
                    details: { userId, requiredHold, riskRevision: account.risk_revision },
                }).catch(() => null);
                return false;
            }
        }

        const account = sellerRiskAccount(claim);
        await sellerPayoutHoldRpc("complete_seller_payout_hold", {
            p_seller_cms_user_id: userId,
            p_owner: owner,
            p_expected_risk_revision: account.risk_revision,
            p_applied_minimum_amount: account.provider_hold_minimum_amount,
            p_succeeded: false,
            p_error: "Seller payout hold changed repeatedly during provider synchronization",
        }).catch(() => null);
        return false;
    }

    async function enforceSellerRecoveryPayoutHold(userId: string): Promise<boolean> {
        const owner = crypto.randomUUID();
        const claim = await sellerPayoutHoldRpc("claim_seller_payout_hold", {
            p_seller_cms_user_id: userId,
            p_owner: owner,
            p_require_risk: true,
        });
        return claim.claimed === true ? await applyClaimedSellerRecoveryPayoutHold(userId, owner, claim) : false;
    }

    return { applyClaimedSellerRecoveryPayoutHold, enforceSellerRecoveryPayoutHold };
}
