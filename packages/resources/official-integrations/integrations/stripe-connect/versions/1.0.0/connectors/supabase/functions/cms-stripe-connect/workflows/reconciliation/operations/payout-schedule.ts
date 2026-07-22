import { updateFinancialOperation } from "../../../db/repositories/financial-operations.ts";
import { sellerPayoutHoldRpc } from "../../../db/repositories/payout-controls.ts";
import type { ConnectAccountRow } from "../../../db/records/accounts.ts";
import type { FinancialOperationRow } from "../../../db/records/operations.ts";
import { balanceSettingsMatchRequest } from "../../../domain/accounts/payout-settings.ts";
import {
    retrieveConnectedBalanceSettings,
    retrievePlatformBalanceSettings,
} from "../../../provider/accounts/balances.ts";
import type { StripeBalanceSettings } from "../../../provider/types.ts";
import { errorMessage, numberAt } from "../../../shared/data.ts";
import type { JsonRecord } from "../../../shared/types.ts";
import { optionalOperationString, requiredOperationString } from "../../operations/request-values.ts";
import { recoverSellerRiskHold } from "./seller-risk-hold.ts";

type PayoutScheduleRecoveryDependencies = {
    sellerRiskAccount(result: JsonRecord): ConnectAccountRow;
    applyClaimedSellerRecoveryPayoutHold(userId: string, owner: string, claim: JsonRecord): Promise<boolean>;
    restoreSellerAutomaticPayoutSchedule(userId: string): Promise<boolean>;
};

export type RecoverPayoutScheduleOperation = (operation: FinancialOperationRow) => Promise<boolean>;

export function createPayoutScheduleOperationRecovery({
    sellerRiskAccount,
    applyClaimedSellerRecoveryPayoutHold,
    restoreSellerAutomaticPayoutSchedule,
}: PayoutScheduleRecoveryDependencies): RecoverPayoutScheduleOperation {
    return async function recoverPayoutScheduleOperation(operation) {
        const scope = optionalOperationString(operation, "scope");
        const stripeAccountId = optionalOperationString(operation, "stripeAccountId");
        const cmsUserId = optionalOperationString(operation, "cmsUserId");
        if (!cmsUserId || !stripeAccountId) {
            const current = scope === "platform" ? await retrievePlatformBalanceSettings() : null;
            if (!current || !balanceSettingsMatchRequest(current, operation.request)) {
                throw new Error("payout schedule operation does not match current Stripe Balance Settings");
            }
            await succeedOperation(operation, current);
            return true;
        }

        const owner = crypto.randomUUID();
        const claim = await sellerPayoutHoldRpc("claim_seller_payout_hold", {
            p_seller_cms_user_id: cmsUserId,
            p_owner: owner,
            p_require_risk: false,
        });
        if (claim.claimed !== true) {
            throw new Error("seller payout control is already being synchronized");
        }
        const account = sellerRiskAccount(claim);
        let current: StripeBalanceSettings;
        try {
            current = await retrieveConnectedBalanceSettings(stripeAccountId);
        } catch (error) {
            await completeFailedClaim(cmsUserId, owner, account, error);
            throw error;
        }

        if (operation.business_key.startsWith("seller-risk-hold:")) {
            const protectedByHold = await recoverSellerRiskHold(
                operation,
                cmsUserId,
                owner,
                claim,
                account,
                current,
                applyClaimedSellerRecoveryPayoutHold,
                restoreSellerAutomaticPayoutSchedule,
            );
            if (!protectedByHold) {
                throw new Error("seller payout hold recovery requires finance review");
            }
        } else {
            await recoverSellerScheduleConfiguration(
                operation,
                cmsUserId,
                owner,
                claim,
                account,
                current,
                applyClaimedSellerRecoveryPayoutHold,
            );
        }
        await succeedOperation(operation, await retrieveConnectedBalanceSettings(stripeAccountId));
        return true;
    };
}

async function recoverSellerScheduleConfiguration(
    operation: FinancialOperationRow,
    cmsUserId: string,
    owner: string,
    claim: JsonRecord,
    account: ConnectAccountRow,
    current: StripeBalanceSettings,
    applyHold: PayoutScheduleRecoveryDependencies["applyClaimedSellerRecoveryPayoutHold"],
): Promise<void> {
    if (!balanceSettingsMatchRequest(current, operation.request)) {
        const cancelled = await sellerPayoutHoldRpc("cancel_seller_payout_configuration", {
            p_seller_cms_user_id: cmsUserId,
            p_owner: owner,
            p_expected_risk_revision: account.risk_revision,
        }).catch(() => null);
        if (cancelled?.accepted === true && cancelled.superseded === true) {
            await applyHold(cmsUserId, owner, cancelled).catch(() => false);
        }
        throw new Error("payout schedule operation does not match current Stripe Balance Settings");
    }
    const expectedRiskRevision = numberAt(operation.request, "riskRevision");
    if (!Number.isSafeInteger(expectedRiskRevision) || expectedRiskRevision! < 0) {
        await applyHold(cmsUserId, owner, claim);
        throw new Error("legacy payout schedule operation has no coherent seller risk revision");
    }
    const finalized = await sellerPayoutHoldRpc("finalize_seller_payout_configuration", {
        p_seller_cms_user_id: cmsUserId,
        p_owner: owner,
        p_expected_risk_revision: expectedRiskRevision!,
        p_interval: requiredOperationString(operation, "interval"),
    });
    if (finalized.accepted !== true || finalized.superseded === true) {
        if (finalized.accepted === true) {
            await applyHold(cmsUserId, owner, finalized);
        }
        throw new Error("payout schedule operation was superseded by seller financial risk");
    }
}

async function completeFailedClaim(
    cmsUserId: string,
    owner: string,
    account: ConnectAccountRow,
    error: unknown,
): Promise<void> {
    await sellerPayoutHoldRpc("complete_seller_payout_hold", {
        p_seller_cms_user_id: cmsUserId,
        p_owner: owner,
        p_expected_risk_revision: account.risk_revision,
        p_applied_minimum_amount: account.provider_hold_minimum_amount,
        p_succeeded: false,
        p_error: errorMessage(error),
    }).catch(() => null);
}

async function succeedOperation(operation: FinancialOperationRow, response: StripeBalanceSettings): Promise<void> {
    await updateFinancialOperation(operation.id, {
        status: "succeeded",
        response,
        last_error: null,
        completed_at: new Date().toISOString(),
    });
}
