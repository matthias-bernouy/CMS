import { listRows } from "../../db/postgrest.ts";
import { updateAccountRow } from "../../db/repositories/accounts.ts";
import { resolveProviderException, upsertProviderException } from "../../db/repositories/events-exceptions.ts";
import { accountSelect, type ConnectAccountRow } from "../../db/records/accounts.ts";
import { retrieveConnectedBalanceSettings } from "../../provider/accounts/balances.ts";
import { errorMessage, numberAt, objectAt, stringAt } from "../../shared/data.ts";

type AccountHoldReconciliationDependencies = {
    enforceSellerRecoveryPayoutHold(userId: string): Promise<boolean>;
    restoreSellerAutomaticPayoutSchedule(userId: string): Promise<boolean>;
};

export type AccountHoldReconciliation = {
    remainingWorkBudget: number;
    scanned: number;
    repaired: number;
    exceptions: number;
    reconciledSellerRiskAccounts: number;
    reconciledManualPayoutHolds: number;
};

export type ReconcileAccountPayoutHolds = (remainingWorkBudget: number) => Promise<AccountHoldReconciliation>;

export function createAccountPayoutHoldReconciliation({
    enforceSellerRecoveryPayoutHold,
    restoreSellerAutomaticPayoutSchedule,
}: AccountHoldReconciliationDependencies): ReconcileAccountPayoutHolds {
    return async function reconcileAccountPayoutHolds(remainingWorkBudget) {
        let repaired = 0;
        let exceptions = 0;
        const sellerRiskBudget = Math.max(1, remainingWorkBudget - 1);
        const sellerRiskAccounts =
            remainingWorkBudget > 0
                ? await listRows<ConnectAccountRow>(
                      "accounts?or=(outstanding_debt_amount.gt.0,financial_exposure_amount.gt.0)" +
                          `&select=${encodeURIComponent(accountSelect)}` +
                          `&order=payout_hold_claimed_at.asc.nullsfirst,updated_at.asc&limit=${sellerRiskBudget}`,
                  )
                : [];
        remainingWorkBudget -= sellerRiskAccounts.length;
        for (const account of sellerRiskAccounts) {
            try {
                await enforceSellerRecoveryPayoutHold(account.cms_user_id);
            } catch (error) {
                exceptions++;
                await upsertProviderException(`seller-payout-hold-reconciliation:${account.cms_user_id}`, {
                    exception_type: "seller_payout_hold_reconciliation_failed",
                    severity: "critical",
                    message: errorMessage(error),
                    details: { userId: account.cms_user_id },
                }).catch(() => null);
            }
        }
        const manualPayoutHoldAccounts =
            remainingWorkBudget > 0
                ? await listRows<ConnectAccountRow>(
                      "accounts?manual_payout_hold_deadline_at=not.is.null" +
                          `&select=${encodeURIComponent(accountSelect)}` +
                          `&order=manual_payout_hold_deadline_at.asc&limit=${remainingWorkBudget}`,
                  )
                : [];
        remainingWorkBudget -= manualPayoutHoldAccounts.length;
        for (const account of manualPayoutHoldAccounts) {
            const restorationRequired = account.outstanding_debt_amount + account.financial_exposure_amount === 0;
            if (restorationRequired && (await restoreSellerAutomaticPayoutSchedule(account.cms_user_id))) {
                repaired++;
                await resolveProviderException(`seller-manual-payout-hold-drift:${account.cms_user_id}`);
                await resolveProviderException(`seller-manual-payout-hold-alert:${account.cms_user_id}`);
                await resolveProviderException(`seller-manual-payout-hold-deadline:${account.cms_user_id}`);
                continue;
            }
            let accountHasException = restorationRequired;
            if (restorationRequired) {
                await updateAccountRow(account.cms_user_id, {
                    risk_status: "manual_review",
                    financial_hold_reason: "Automatic seller payout schedule restoration requires Finance review",
                }).catch(() => null);
            }
            const exceptionDetails = {
                userId: account.cms_user_id,
                stripeAccountId: account.stripe_account_id,
                manualPayoutHoldStartedAt: account.manual_payout_hold_started_at,
                manualPayoutHoldAlertAt: account.manual_payout_hold_alert_at,
                manualPayoutHoldDeadlineAt: account.manual_payout_hold_deadline_at,
            };
            const alertAt = Date.parse(account.manual_payout_hold_alert_at ?? "");
            const deadlineAt = Date.parse(account.manual_payout_hold_deadline_at ?? "");
            const now = Date.now();
            let providerHoldConfirmed = false;
            try {
                if (!account.stripe_account_id || account.payout_schedule !== "manual") {
                    throw new Error("Emergency seller payout hold is not locally configured as manual");
                }
                const current = await retrieveConnectedBalanceSettings(account.stripe_account_id);
                const payouts = objectAt(objectAt(current, "payments"), "payouts");
                const providerInterval = stringAt(objectAt(payouts, "schedule"), "interval");
                const providerMinimum = numberAt(objectAt(payouts, "minimum_balance_by_currency"), "eur") ?? 0;
                const requiredMinimum = Math.max(
                    account.provider_hold_minimum_amount,
                    account.outstanding_debt_amount + account.financial_exposure_amount,
                );
                if (providerInterval !== "manual" || providerMinimum < requiredMinimum) {
                    throw new Error("Emergency seller payout hold drifted from the required provider controls");
                }
                providerHoldConfirmed = true;
                await resolveProviderException(`seller-manual-payout-hold-drift:${account.cms_user_id}`);
            } catch (error) {
                accountHasException = true;
                await updateAccountRow(account.cms_user_id, {
                    risk_status: "manual_review",
                    financial_hold_reason: "Emergency seller payout hold requires immediate finance review",
                }).catch(() => null);
                await upsertProviderException(`seller-manual-payout-hold-drift:${account.cms_user_id}`, {
                    exception_type: "seller_manual_payout_hold_drift",
                    severity: "critical",
                    message: errorMessage(error),
                    details: exceptionDetails,
                }).catch(() => null);
            }
            if (!Number.isFinite(alertAt) || !Number.isFinite(deadlineAt) || alertAt >= deadlineAt) {
                accountHasException = true;
                await updateAccountRow(account.cms_user_id, {
                    risk_status: "manual_review",
                    financial_hold_reason: "Emergency seller payout hold deadline is invalid",
                }).catch(() => null);
                await upsertProviderException(`seller-manual-payout-hold-deadline:${account.cms_user_id}`, {
                    exception_type: "seller_manual_payout_hold_deadline_invalid",
                    severity: "critical",
                    message: "Emergency seller payout hold has no valid country deadline",
                    details: exceptionDetails,
                }).catch(() => null);
            } else if (now >= deadlineAt) {
                accountHasException = true;
                await updateAccountRow(account.cms_user_id, {
                    risk_status: "manual_review",
                    financial_hold_reason: "Emergency seller payout hold exceeded the French 90-day deadline",
                }).catch(() => null);
                await resolveProviderException(`seller-manual-payout-hold-alert:${account.cms_user_id}`);
                await upsertProviderException(`seller-manual-payout-hold-deadline:${account.cms_user_id}`, {
                    exception_type: "seller_manual_payout_hold_deadline_exceeded",
                    severity: "critical",
                    message: "Emergency seller payout hold exceeded the French 90-day deadline",
                    details: { ...exceptionDetails, providerHoldConfirmed },
                }).catch(() => null);
            } else {
                await resolveProviderException(`seller-manual-payout-hold-deadline:${account.cms_user_id}`);
                if (now >= alertAt) {
                    accountHasException = true;
                    await upsertProviderException(`seller-manual-payout-hold-alert:${account.cms_user_id}`, {
                        exception_type: "seller_manual_payout_hold_deadline_approaching",
                        severity: "high",
                        message: "Emergency seller payout hold is approaching the French 90-day deadline",
                        details: { ...exceptionDetails, providerHoldConfirmed },
                    }).catch(() => null);
                } else {
                    await resolveProviderException(`seller-manual-payout-hold-alert:${account.cms_user_id}`);
                }
            }
            if (accountHasException) {
                exceptions++;
            }
        }
        return {
            remainingWorkBudget,
            scanned: sellerRiskAccounts.length + manualPayoutHoldAccounts.length,
            repaired,
            exceptions,
            reconciledSellerRiskAccounts: sellerRiskAccounts.length,
            reconciledManualPayoutHolds: manualPayoutHoldAccounts.length,
        };
    };
}
