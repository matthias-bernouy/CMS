import { asRecord } from "../../records";
import type { JsonRecord } from "../../types";
import { PaymentLedgerFixtures } from "./ledger/payments";

export class PayoutFixtures extends PaymentLedgerFixtures {
    setManualPayoutHoldWindow(userId: string, startedAt: string, alertAt: string, deadlineAt: string): void {
        const account = this.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account) {
            throw new Error(`unknown account ${userId}`);
        }
        this.update(account, {
            manual_payout_hold_started_at: startedAt,
            manual_payout_hold_alert_at: alertAt,
            manual_payout_hold_deadline_at: deadlineAt,
        });
    }

    loseNextSellerPayoutSettingsResponse(): void {
        this.loseNextSellerBalanceSettingsResponse = true;
    }

    setIndependentSellerRisk(userId: string, reason: string): void {
        const account = this.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account) {
            throw new Error(`unknown account ${userId}`);
        }
        this.update(account, {
            risk_status: "manual_review",
            financial_hold_reason: reason,
            payout_blocked_at: account.payout_blocked_at ?? new Date().toISOString(),
        });
    }

    markFinancialOperationSucceeded(businessKey: string): void {
        const operation = this.tables.financial_operations.find((row) => row.business_key === businessKey);
        if (!operation) {
            throw new Error(`unknown financial operation ${businessKey}`);
        }
        this.update(operation, {
            status: "succeeded",
            last_error: null,
            completed_at: new Date().toISOString(),
        });
    }

    omitMinimumBalanceOnNextBalanceSettingsUpdate(): void {
        this.omitMinimumBalanceOnNextUpdate = true;
    }

    addRiskDuringNextSellerAutomaticRestore(): void {
        this.addSellerRiskDuringNextAutomaticRestore = true;
    }

    setConnectedPayoutSettings(interval: string, minimumBalanceEur: number): void {
        const payouts = asRecord(asRecord(this.balanceSettings.payments).payouts);
        payouts.schedule = { interval };
        payouts.minimum_balance_by_currency = { eur: minimumBalanceEur };
    }

    seedEmergencySellerHold(
        userId: string,
        financialExposureAmount: number,
        restoreSettings: JsonRecord = {
            interval: "daily",
            minimumBalanceEur: 0,
            debitNegativeBalances: false,
        },
    ): void {
        const account = this.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account) {
            throw new Error(`unknown account ${userId}`);
        }
        this.update(account, {
            payout_schedule: "manual",
            risk_status: financialExposureAmount > 0 ? "restricted" : "standard",
            financial_hold_reason:
                financialExposureAmount > 0 ? "Seller recovery exposure blocks payments and payouts" : null,
            financial_exposure_amount: financialExposureAmount,
            risk_revision: Number(account.risk_revision ?? 0) + 1,
            provider_hold_minimum_amount: financialExposureAmount,
            manual_payout_hold_started_at: "2026-07-01T00:00:00.000Z",
            manual_payout_hold_alert_at: "2026-09-14T00:00:00.000Z",
            manual_payout_hold_deadline_at: "2026-09-29T00:00:00.000Z",
            manual_payout_hold_restore_settings: restoreSettings,
        });
        this.setConnectedPayoutSettings("manual", financialExposureAmount);
    }
    setPlatformPayoutInterval(interval: string): void {
        const payments = this.platformBalanceSettings.payments as JsonRecord;
        const payouts = payments.payouts as JsonRecord;
        payouts.schedule = { interval };
    }

    setPlatformPayoutMinimum(minimumBalanceEur: number): void {
        const payments = this.platformBalanceSettings.payments as JsonRecord;
        const payouts = payments.payouts as JsonRecord;
        payouts.minimum_balance_by_currency = { eur: minimumBalanceEur };
    }

    setPlatformPayoutControl(patch: JsonRecord): void {
        const control = this.tables.platform_payout_controls[0];
        if (!control) {
            throw new Error("platform payout control is missing");
        }
        this.update(control, patch);
    }

    removePlatformPayoutControl(): void {
        this.tables.platform_payout_controls.length = 0;
    }

    rejectTransferReversals(): void {
        this.failTransferReversals = true;
    }

    failNextTransferCreationOnce(): void {
        this.failNextTransferCreation = true;
    }

    loseNextTransferResponseOnce(): void {
        this.loseNextTransferCreationResponse = true;
    }

    omitProviderTransfersOnNextList(): void {
        this.omitProviderTransfersFromNextList = true;
    }

    removeAccount(userId: string): void {
        const index = this.tables.accounts.findIndex((row) => row.cms_user_id === userId);
        if (index < 0) {
            throw new Error(`unknown account ${userId}`);
        }
        this.tables.accounts.splice(index, 1);
    }

    loseTransferReversalResponseAfter(successfulUpcomingReversals: number): void {
        this.loseTransferReversalResponseAt = this.nextReversalId + successfulUpcomingReversals;
    }

    setNextTransferReversalScenario(
        scenario: "operation-succeeded" | "metadata-match" | "manual-review-no-match" | "ambiguous" | "has-more",
    ): void {
        this.nextTransferReversalScenario = scenario;
    }
}
