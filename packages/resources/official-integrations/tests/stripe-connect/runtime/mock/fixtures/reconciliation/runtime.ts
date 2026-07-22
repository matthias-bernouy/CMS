import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import { ReconciliationPageFixtures } from "./pages";

export class ReconciliationRuntimeFixtures extends ReconciliationPageFixtures {
    seedPaymentProjection(paymentId: number, key: string): void {
        this.insertGeneric("commerce_projection_outbox", {
            operation_id: null,
            payment_id: paymentId,
            projection_key: key,
            projection_kind: "payment",
            provider_object_id: String(paymentId),
            projection_payload: {},
            recovery_key: null,
            causal_sequence: 0,
            projection_status: "pending",
            attempt_count: 0,
            next_attempt_at: null,
            claim_owner: null,
            claim_token: null,
            claimed_at: null,
            last_error: null,
            projected_at: null,
            intervention_revision: 0,
            last_intervention_at: null,
            last_intervention_by: null,
            last_intervention_reason: null,
        });
    }

    expireProjectionLease(projectionId: number): void {
        const projection = this.tables.commerce_projection_outbox.find((row) => same(row.id, projectionId));
        if (!projection) {
            throw new Error(`unknown projection ${projectionId}`);
        }
        projection.claimed_at = "2026-07-06T00:00:00.000Z";
    }

    makeProjectionRetryDue(projectionId: number): void {
        const projection = this.tables.commerce_projection_outbox.find((row) => same(row.id, projectionId));
        if (!projection) {
            throw new Error(`unknown projection ${projectionId}`);
        }
        this.update(projection, { next_attempt_at: "2020-01-01T00:00:00.000Z" });
    }

    rejectBalanceSettingsUpdates(): void {
        this.failBalanceSettingsUpdates = true;
    }

    pauseNextSellerBalanceSettingsUpdate(): { entered: Promise<void>; resume: () => void } {
        let markEntered!: () => void;
        let resume!: () => void;
        const entered = new Promise<void>((resolve) => {
            markEntered = resolve;
        });
        const wait = new Promise<void>((resolve) => {
            resume = resolve;
        });
        this.nextSellerBalanceSettingsPause = { entered: markEntered, wait };
        return { entered, resume };
    }

    pauseNextPlatformBalanceSettingsUpdate(): { entered: Promise<void>; resume: () => void } {
        let markEntered!: () => void;
        let resume!: () => void;
        const entered = new Promise<void>((resolve) => {
            markEntered = resolve;
        });
        const wait = new Promise<void>((resolve) => {
            resume = resolve;
        });
        this.nextPlatformBalanceSettingsPause = { entered: markEntered, wait };
        return { entered, resume };
    }

    pauseNextPlatformBalanceSettingsRead(): { entered: Promise<void>; resume: () => void } {
        let markEntered!: () => void;
        let resume!: () => void;
        const entered = new Promise<void>((resolve) => {
            markEntered = resolve;
        });
        const wait = new Promise<void>((resolve) => {
            resume = resolve;
        });
        this.nextPlatformBalanceSettingsReadPause = { entered: markEntered, wait };
        return { entered, resume };
    }

    pauseNextRefundReload(): { entered: Promise<void>; resume: () => void } {
        let markEntered!: () => void;
        let resume!: () => void;
        const entered = new Promise<void>((resolve) => {
            markEntered = resolve;
        });
        const wait = new Promise<void>((resolve) => {
            resume = resolve;
        });
        this.nextRefundReloadPause = { entered: markEntered, wait };
        return { entered, resume };
    }

    pauseNextPostgrestRead(table: string, readsToSkip = 0): { entered: Promise<void>; resume: () => void } {
        let markEntered!: () => void;
        let resume!: () => void;
        const entered = new Promise<void>((resolve) => {
            markEntered = resolve;
        });
        const wait = new Promise<void>((resolve) => {
            resume = resolve;
        });
        this.nextPostgrestReadPause = { table, readsToSkip, entered: markEntered, wait };
        return { entered, resume };
    }

    async waitForPostgrestRead(table: string): Promise<void> {
        const pause = this.nextPostgrestReadPause;
        if (pause?.table !== table) {
            return;
        }
        if (pause.readsToSkip > 0) {
            pause.readsToSkip--;
            return;
        }
        this.nextPostgrestReadPause = null;
        pause.entered();
        await pause.wait;
    }

    loseNextPlatformPayoutProtectionResponse(): void {
        this.loseNextPlatformBalanceSettingsResponse = true;
    }

    exposeSellerFinancialRisk(userId: string, amount: number): void {
        const account = this.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account) {
            throw new Error(`unknown account ${userId}`);
        }
        this.update(account, {
            financial_exposure_amount: amount,
            risk_revision: Number(account.risk_revision ?? 0) + 1,
            risk_status: "restricted",
            financial_hold_reason: "Seller recovery exposure blocks payments and payouts",
            payout_blocked_at: new Date().toISOString(),
        });
    }

    seedSucceededTransfer(paymentId: number, amount: number): void {
        const payment = this.tables.payments.find((row) => same(row.id, paymentId));
        if (!payment) {
            throw new Error(`unknown payment ${paymentId}`);
        }
        const now = "2026-07-06T12:06:00.000Z";
        this.tables.transfers.push({
            id: this.nextRowId++,
            payment_id: paymentId,
            operation_id: this.nextRowId++,
            release_authorization_id: `seed-divergence-${paymentId}`,
            stripe_transfer_id: `tr_divergence_${paymentId}`,
            source_charge_id: payment.stripe_charge_id,
            destination_account_id: payment.seller_stripe_account_id,
            transfer_group: payment.transfer_group,
            amount,
            currency: payment.currency,
            status: "succeeded",
            provider_snapshot: { id: `tr_divergence_${paymentId}`, amount },
            created_at: now,
            updated_at: now,
        });
    }

    seedSettlementLedgerRow(table: "transfers" | "transfer_reversals" | "refunds", row: JsonRecord): JsonRecord {
        return this.insertGeneric(table, row);
    }
}
