import { getAccountRow } from "../../db/repositories/accounts.ts";
import {
    reserveAccountFinancialOperation,
    updateFinancialOperation,
} from "../../db/repositories/financial-operations.ts";
import { sellerPayoutHoldRpc } from "../../db/repositories/payout-controls.ts";
import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import type { FinancialOperationRow } from "../../db/records/operations.ts";
import { balanceSettingsMatchRequest } from "../../domain/accounts/payout-settings.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import { HttpError } from "../../http/errors.ts";
import { retrieveConnectedBalanceSettings, updateBalanceSettings } from "../../provider/accounts/balances.ts";
import { stableStripeIdempotencyKey } from "../../shared/crypto.ts";
import { errorMessage } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { readSellerPayoutScheduleInput } from "./seller-schedule-input.ts";
import {
    completeAmbiguousPayout,
    payoutOperationRequest,
    sellerPayoutResponse,
    succeedPayoutOperation,
} from "./seller-schedule-workflow.ts";

type SellerPayoutScheduleDependencies = {
    sellerRiskAccount(result: JsonRecord): ConnectAccountRow;
    applyClaimedSellerRecoveryPayoutHold(userId: string, owner: string, claim: JsonRecord): Promise<boolean>;
};

export function createConfigureSellerPayoutSchedule({
    sellerRiskAccount,
    applyClaimedSellerRecoveryPayoutHold,
}: SellerPayoutScheduleDependencies): (request: Request) => Promise<Response> {
    return async function configureSellerPayoutSchedule(request) {
        requireCmsRequest(request, { requireUser: false });
        const input = await readSellerPayoutScheduleInput(request);
        const { userId, payoutScheduleChangeId, interval, minimumBalanceEur } = input;
        const owner = crypto.randomUUID();
        const claim = await sellerPayoutHoldRpc("claim_seller_payout_hold", {
            p_seller_cms_user_id: userId,
            p_owner: owner,
            p_require_risk: false,
            p_require_connected_account: true,
        });
        if (claim.connectedAccountFound === false) {
            throw new HttpError(404, "connected account not found");
        }
        if (claim.claimed !== true) {
            throw new HttpError(409, "another seller payout control update is already in progress");
        }
        const account = sellerRiskAccount(claim);
        const requiredRiskBalance = account.outstanding_debt_amount + account.financial_exposure_amount;
        if (
            requiredRiskBalance > 0 &&
            (interval !== "manual" ||
                (minimumBalanceEur ?? 0) < Math.max(requiredRiskBalance, account.provider_hold_minimum_amount))
        ) {
            await applyClaimedSellerRecoveryPayoutHold(userId, owner, claim);
            throw new HttpError(
                409,
                "seller financial exposure requires a manual payout hold covering the full risk balance",
            );
        }
        const operationRequest = payoutOperationRequest(input, account);
        const businessKey = `payout-schedule:${userId}:${payoutScheduleChangeId}`;
        let operation: FinancialOperationRow | null = null;
        try {
            operation = await reserveAccountFinancialOperation(userId, {
                businessKey,
                operationType: "payout_schedule_update",
                request: operationRequest,
            });
            const current = await retrieveConnectedBalanceSettings(account.stripe_account_id);
            const providerAlreadyMatches = balanceSettingsMatchRequest(current, operationRequest);
            // The provider confirmation is the durable recovery signal. The RPC below
            // still clears only our exact ambiguous-recovery hold with no debt or
            // exposure, including installations stranded by an older successful replay.
            const recoversAmbiguousProviderConfirmation = providerAlreadyMatches;
            let provider = current;
            if (!providerAlreadyMatches) {
                if (operation.status === "manual_review" && operation.attempt_count > 0) {
                    throw new HttpError(409, "payout schedule state is ambiguous and requires finance review");
                }
                await updateFinancialOperation(operation.id, {
                    status: "processing",
                    claimed_at: new Date().toISOString(),
                    attempt_count: operation.attempt_count + 1,
                });
                provider = await updateBalanceSettings(
                    account.stripe_account_id,
                    operationRequest,
                    await stableStripeIdempotencyKey(
                        "payout-schedule",
                        `${businessKey}:${account.payout_hold_claimed_at ?? owner}`,
                    ),
                );
            }
            if (!balanceSettingsMatchRequest(provider, operationRequest)) {
                throw new HttpError(502, "Stripe did not confirm the requested seller payout schedule");
            }

            const finalized = await sellerPayoutHoldRpc("finalize_seller_payout_configuration", {
                p_seller_cms_user_id: userId,
                p_owner: owner,
                p_expected_risk_revision: account.risk_revision,
                p_interval: interval,
                p_clear_ambiguous_recovery_hold: recoversAmbiguousProviderConfirmation,
            });
            if (finalized.accepted !== true || finalized.superseded === true) {
                const protectedByHold =
                    finalized.accepted === true &&
                    (await applyClaimedSellerRecoveryPayoutHold(userId, owner, finalized));
                if (!protectedByHold) {
                    throw new HttpError(
                        409,
                        "seller risk changed and the replacement payout hold requires finance review",
                    );
                }
                const finalAccount = (await getAccountRow(userId)) ?? sellerRiskAccount(finalized);
                const finalProvider = await retrieveConnectedBalanceSettings(account.stripe_account_id);
                if (interval === "manual") {
                    await succeedPayoutOperation(operation.id, finalProvider);
                    return sellerPayoutResponse(finalAccount, finalProvider, operation.id, payoutScheduleChangeId);
                }
                throw new HttpError(409, "payout schedule change was superseded by seller financial risk");
            }

            const updatedAccount = sellerRiskAccount(finalized);
            await succeedPayoutOperation(operation.id, provider);
            return sellerPayoutResponse(updatedAccount, provider, operation.id, payoutScheduleChangeId);
        } catch (error) {
            const message = errorMessage(error);
            const ambiguous = !(error instanceof HttpError) || error.status >= 500;
            if (operation) {
                await updateFinancialOperation(operation.id, {
                    status: ambiguous ? "manual_review" : "failed",
                    last_error: message,
                }).catch(() => null);
            }
            if (ambiguous) {
                await completeAmbiguousPayout(
                    userId,
                    owner,
                    account,
                    operation,
                    payoutScheduleChangeId,
                    operationRequest,
                    message,
                );
            } else {
                const cancelled = await sellerPayoutHoldRpc("cancel_seller_payout_configuration", {
                    p_seller_cms_user_id: userId,
                    p_owner: owner,
                    p_expected_risk_revision: account.risk_revision,
                }).catch(() => null);
                if (cancelled?.accepted === true && cancelled.superseded === true) {
                    await applyClaimedSellerRecoveryPayoutHold(userId, owner, cancelled).catch(() => false);
                }
            }
            throw error;
        }
    };
}
