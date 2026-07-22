import { expect } from "bun:test";
import { isDeepStrictEqual } from "node:util";
import type { DashboardTable, PostgrestRequestRecord } from "../../dashboard/dashboard-contract-harness";
import type { ProtectedRefundSearchScenario } from "../../provider-boundary/harness";
import type { ProtectedPaymentProjectionScenario } from "../../provider-boundary/protected-payment/projection-race-harness";
import type { OperationRecoveryKind, TerminalOperationRecoverySeed } from "../../provider-reconciliation/harness";
import { financialTermsHash, stripeUrl, supabaseUrl } from "../constants";
import { jsonResponse, requestFromFetchInput } from "../http";
import { asRecord, filterValue, isRecord, same } from "../records";
import type { JsonRecord, StripeRequestRecord } from "../types";
import { defaultAccountRow } from "./accounts";
import { fetchStripeProvider } from "./provider/fetch";

export class StripeConnectMock {
    readonly tables: Record<string, JsonRecord[]> = {
        accounts: [],
        marketplace_terms_acceptances: [],
        platform_payout_controls: [
            {
                control_key: "default",
                liability_revision: 0,
                required_minimum_amount: 0,
                provider_minimum_amount: 0,
                decrease_authorization_id: null,
                claim_owner: null,
                claimed_at: null,
                last_error: null,
                last_provider_sync_at: null,
            },
        ],
        payments: [],
        payment_lifecycle_guards: [],
        payment_events: [],
        financial_operations: [],
        commerce_projection_outbox: [],
        commerce_projection_interventions: [],
        transfers: [],
        transfer_recovery_requests: [],
        transfer_reversals: [],
        seller_recovery_exposures: [],
        refunds: [],
        stripe_disputes: [],
        stripe_dispute_evidence: [],
        irreversible_dispute_action_approvals: [],
        stripe_events: [],
        payout_events: [],
        reconciliation_runs: [],
        provider_exceptions: [],
    };
    nextPaymentId = 1;
    nextRowId = 1;
    nextIntentId = 1;
    nextTransferId = 1;
    nextReversalId = 1;
    nextRefundId = 1;
    nextRefundStatus: "succeeded" | "pending" | "failed" = "succeeded";
    nextRefundFee = 0;
    loseNextRefundResponse = false;
    nextRefundSearchScenario: ProtectedRefundSearchScenario | null = null;
    nextRefundOperationSucceeded = false;
    nextRefundReloadPause: { entered: () => void; wait: Promise<void> } | null = null;
    nextPostgrestReadPause: {
        table: string;
        readsToSkip: number;
        entered: () => void;
        wait: Promise<void>;
    } | null = null;
    failTransferReversals = false;
    failNextTransferCreation = false;
    loseNextTransferCreationResponse = false;
    omitProviderTransfersFromNextList = false;
    loseTransferReversalResponseAt: number | null = null;
    nextTransferReversalScenario:
        | "operation-succeeded"
        | "metadata-match"
        | "manual-review-no-match"
        | "ambiguous"
        | "has-more"
        | null = null;
    nextTransferReversalListHasMore = false;
    inFlightTransferBeforeRefund: { paymentId: number; amount: number } | null = null;
    failBalanceSettingsUpdates = false;
    nextSellerBalanceSettingsPause: { entered: () => void; wait: Promise<void> } | null = null;
    nextPlatformBalanceSettingsReadPause: { entered: () => void; wait: Promise<void> } | null = null;
    nextPlatformBalanceSettingsPause: { entered: () => void; wait: Promise<void> } | null = null;
    loseNextPlatformBalanceSettingsResponse = false;
    loseNextSellerBalanceSettingsResponse = false;
    omitMinimumBalanceOnNextUpdate = false;
    addSellerRiskDuringNextAutomaticRestore = false;
    loseNextPaymentCancellationResponse = false;
    returnNextPaymentCancellationNonTerminal = false;
    failNextPaymentCancellationReservation = false;
    failPaymentProjectionEnqueue = false;
    failFinancialOperationFailureUpdate = false;
    failDisputeFileUpload = false;
    failNextPaymentIntentCreation = false;
    nextPostgrestWriteFailure: { table: string; method: "POST" | "PATCH" } | null = null;
    nextProtectedPaymentReservationFailure: "missing" | "raced" | null = null;
    linkNextProtectedPaymentReservation = false;
    nextPaymentIntentOperationSucceeded = false;
    nextPaymentIntentProjectionManualReview = false;
    nextProtectedPaymentProjectionScenario: ProtectedPaymentProjectionScenario | null = null;
    failProviderExceptionResolution = false;
    failPaymentReconciliationLedgerRead = false;
    failPaymentReconciliationLocalContextRead = false;
    failAccountReloadAfterTermsAcceptance = false;
    omitNextAccountRead = false;
    omitNextPaymentReadResult = false;
    providerTransferContextReadsBeforeFailure: number | null = null;
    failProviderDisputeList = false;
    failProviderRefundList = false;
    failProviderTransferList = false;
    losePaymentProjectionEnqueueResponse = false;
    failPaymentIntentRetrieve = false;
    paymentIntentReplacementOnNextRetrieve: { paymentId: number; replacementId: string } | null = null;
    readonly paymentIntents = new Map<string, JsonRecord>();
    readonly providerCharges = new Map<string, JsonRecord>();
    readonly providerBalanceTransactions = new Map<string, JsonRecord>();
    readonly providerTransfers: JsonRecord[] = [];
    readonly providerTransferReversals = new Map<string, JsonRecord[]>();
    readonly providerRefunds: JsonRecord[] = [];
    readonly providerDisputes: JsonRecord[] = [];
    readonly providerPayouts = new Map<string, JsonRecord>();
    availableEur = 4500;
    readonly stripeAccountState = new Map<string, JsonRecord>();
    readonly customAccountIds = new Set<string>();
    lastPaymentIntentParameters: URLSearchParams | null = null;
    lastTransferParameters: Record<string, string> | null = null;
    readonly transferReversalRequests: Array<{
        transferId: string;
        parameters: Array<[string, string]>;
        idempotencyKey: string | null;
    }> = [];
    readonly moneyCallOrder: string[] = [];
    readonly accountCreationRequests: Array<{ body: JsonRecord; idempotencyKey: string | null }> = [];
    readonly accountLinkRequests: JsonRecord[] = [];
    readonly accountUpdateRequests: Array<{
        accountId: string;
        body: JsonRecord;
        idempotencyKey: string | null;
    }> = [];
    readonly externalRequestOrder: string[] = [];
    readonly fileUploadRequests: Array<{
        purpose: string;
        fileName: string;
        mimeType: string;
        content: number[];
    }> = [];
    readonly refundCreateRequests: Array<{
        parameters: Array<[string, string]>;
        idempotencyKey: string | null;
    }> = [];
    readonly postgrestRequests: PostgrestRequestRecord[] = [];
    readonly stripeRequests: StripeRequestRecord[] = [];
    paymentIntentCreateCount = 0;
    chargeRetrieveCount = 0;
    balanceTransactionRetrieveCount = 0;
    balanceSettingsUpdateCount = 0;
    balanceSettings: JsonRecord = {
        object: "balance_settings",
        payments: {
            debit_negative_balances: false,
            payouts: {
                minimum_balance_by_currency: {},
                schedule: { interval: "daily" },
                status: "enabled",
            },
            settlement_timing: { delay_days: 2, delay_days_override: null },
        },
    };
    platformBalanceSettings: JsonRecord = {
        object: "balance_settings",
        payments: {
            debit_negative_balances: true,
            payouts: { minimum_balance_by_currency: {}, schedule: { interval: "daily" }, status: "enabled" },
            settlement_timing: { delay_days: 2, delay_days_override: null },
        },
    };

    setPaymentIntentSucceeded(paymentIntentId: string): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent) {
            throw new Error(`unknown PaymentIntent ${paymentIntentId}`);
        }
        const chargeId = `ch_${paymentIntentId.slice(3)}`;
        const balanceTransaction: JsonRecord = {
            id: `txn_charge_${paymentIntentId.slice(3)}`,
            amount: intent.amount,
            fee: 65,
            net: Number(intent.amount) - 65,
            currency: intent.currency,
            fee_details: [{ type: "stripe_fee", amount: 65, currency: intent.currency }],
        };
        const charge: JsonRecord = {
            id: chargeId,
            payment_intent: paymentIntentId,
            amount: intent.amount,
            amount_captured: intent.amount,
            amount_refunded: 0,
            currency: intent.currency,
            transfer_group: intent.transfer_group,
            paid: true,
            captured: true,
            balance_transaction: balanceTransaction,
        };
        this.providerCharges.set(chargeId, charge);
        this.providerBalanceTransactions.set(String(balanceTransaction.id), balanceTransaction);
        Object.assign(intent, {
            status: "succeeded",
            amount_received: intent.amount,
            latest_charge: charge,
        });
    }

    setPaymentIntentProviderReferences(paymentIntentId: string): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent || !isRecord(intent.latest_charge)) {
            throw new Error(`unknown PaymentIntent charge ${paymentIntentId}`);
        }
        const charge = intent.latest_charge;
        if (!isRecord(charge.balance_transaction)) {
            throw new Error(`unknown Charge balance transaction ${paymentIntentId}`);
        }
        charge.balance_transaction = String(charge.balance_transaction.id);
        intent.latest_charge = String(charge.id);
    }

    patchProviderBalanceTransaction(paymentIntentId: string, patch: JsonRecord): void {
        const transaction = this.providerBalanceTransactions.get(`txn_charge_${paymentIntentId.slice(3)}`);
        if (!transaction) {
            throw new Error(`unknown BalanceTransaction ${paymentIntentId}`);
        }
        Object.assign(transaction, patch);
    }

    seedTransientProviderTruthReview(paymentId: number, paymentIntentId: string): void {
        this.patchPaymentLedger(paymentId, {
            payment_status: "failed",
            settlement_status: "manual_review",
            manual_review_reason: "Stripe payment provider truth mismatch: charge_balance_transaction_expansion",
            stripe_charge_id: `ch_${paymentIntentId.slice(3)}`,
            paid_at: null,
        });
        this.insertGeneric("provider_exceptions", {
            deduplication_key: `provider-payment-truth:${paymentId}:${paymentIntentId}`,
            payment_id: paymentId,
            operation_id: null,
            exception_type: "provider_payment_truth_mismatch",
            severity: "critical",
            status: "open",
            message: "Stripe payment provider truth mismatch: charge_balance_transaction_expansion",
            details: { mismatches: ["charge_balance_transaction_expansion"] },
            detected_at: "2026-07-06T12:06:00.000Z",
            resolved_at: null,
            resolved_by: null,
        });
    }

    seedOtherOpenProviderException(paymentId: number): void {
        this.insertGeneric("provider_exceptions", {
            deduplication_key: `other-risk:${paymentId}`,
            payment_id: paymentId,
            operation_id: null,
            exception_type: "other_provider_risk",
            severity: "critical",
            status: "open",
            message: "Independent provider risk",
            details: {},
            detected_at: "2026-07-06T12:07:00.000Z",
            resolved_at: null,
            resolved_by: null,
        });
    }

    seedProviderException(
        deduplicationKey: string,
        status: "open" | "investigating" | "resolved",
        patch: JsonRecord = {},
    ): number {
        return Number(
            this.insertGeneric("provider_exceptions", {
                deduplication_key: deduplicationKey,
                payment_id: null,
                operation_id: null,
                exception_type: "provider_reconciliation_contract",
                severity: "critical",
                status,
                message: "Provider reconciliation contract fixture",
                details: {},
                detected_at: "2026-07-06T12:05:00.000Z",
                resolved_at: status === "resolved" ? "2026-07-06T12:06:00.000Z" : null,
                resolved_by: status === "resolved" ? "admin-contract" : null,
                ...patch,
            }).id,
        );
    }

    seedPaymentReconciliationLedger(paymentId: number): void {
        for (const row of [
            { amount: 120, seller_entitlement_reduction_amount: 70, status: "succeeded" },
            { amount: 80, seller_entitlement_reduction_amount: 50, status: "succeeded" },
            { amount: 400, seller_entitlement_reduction_amount: 400, status: "pending" },
        ]) {
            this.insertGeneric("refunds", {
                payment_id: paymentId,
                stripe_refund_id: null,
                ...row,
            });
        }
        for (const row of [
            { amount: 400, status: "succeeded" },
            { amount: 300, status: "partially_reversed" },
            { amount: 200, status: "reversed" },
            { amount: 600, status: "reserved" },
        ]) {
            this.insertGeneric("transfers", { payment_id: paymentId, ...row });
        }
        for (const row of [
            { amount: 125, status: "succeeded" },
            { amount: 75, status: "succeeded" },
            { amount: 500, status: "failed" },
        ]) {
            this.insertGeneric("transfer_reversals", { payment_id: paymentId, ...row });
        }
    }

    setPaymentReconciliationSellerRecoveryAmount(paymentId: number, amount: number): void {
        const refunds = this.tables.refunds.filter(
            (row) => same(row.payment_id, paymentId) && row.status === "succeeded",
        );
        if (refunds.length === 0) {
            throw new Error(`payment ${paymentId} has no succeeded refund`);
        }
        refunds.forEach((refund, index) => {
            refund.seller_entitlement_reduction_amount = index === 0 ? amount : 0;
        });
    }

    removeTransientProviderTruthException(paymentId: number, paymentIntentId: string): void {
        const exceptionKey = `provider-payment-truth:${paymentId}:${paymentIntentId}`;
        const index = this.tables.provider_exceptions.findIndex((row) => row.deduplication_key === exceptionKey);
        if (index < 0) {
            throw new Error(`unknown provider exception ${exceptionKey}`);
        }
        this.tables.provider_exceptions.splice(index, 1);
    }

    setProviderPayout(payout: JsonRecord): void {
        this.providerPayouts.set(String(payout.id), payout);
    }

    setNextRefundStatus(status: "succeeded" | "pending" | "failed"): void {
        this.nextRefundStatus = status;
    }

    setNextRefundFee(amount: number): void {
        this.nextRefundFee = amount;
    }

    loseNextRefundCreationResponse(): void {
        this.loseNextRefundResponse = true;
    }

    setNextRefundSearchScenario(scenario: ProtectedRefundSearchScenario): void {
        this.nextRefundSearchScenario = scenario;
    }

    succeedNextRefundOperation(): void {
        this.nextRefundOperationSucceeded = true;
    }

    updateProviderRefund(refundId: string, patch: JsonRecord): void {
        const refund = this.providerRefunds.find((candidate) => candidate.id === refundId);
        if (!refund) {
            throw new Error(`unknown provider refund ${refundId}`);
        }
        Object.assign(refund, patch);
        if (patch.status === "succeeded" && !refund.balance_transaction) {
            const amount = Number(refund.amount);
            refund.balance_transaction = {
                id: `txn_refund_${refundId.replace(/[^a-z0-9]/gi, "_")}`,
                amount: -amount,
                fee: 0,
                net: -amount,
                currency: refund.currency,
                fee_details: [],
            };
        }
    }

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

    patchPaymentIntent(paymentIntentId: string, patch: JsonRecord): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent) {
            throw new Error(`unknown PaymentIntent ${paymentIntentId}`);
        }
        Object.assign(intent, patch);
    }

    patchPaymentIntentMetadata(paymentIntentId: string, patch: JsonRecord): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent) {
            throw new Error(`unknown PaymentIntent ${paymentIntentId}`);
        }
        intent.metadata = { ...asRecord(intent.metadata), ...patch };
    }

    patchLatestCharge(paymentIntentId: string, patch: JsonRecord): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent || !isRecord(intent.latest_charge)) {
            throw new Error(`unknown PaymentIntent charge ${paymentIntentId}`);
        }
        Object.assign(intent.latest_charge, patch);
    }

    losePaymentCancellationResponseOnce(): void {
        this.loseNextPaymentCancellationResponse = true;
    }

    keepNextPaymentCancellationNonTerminal(): void {
        this.returnNextPaymentCancellationNonTerminal = true;
    }

    failNextPaymentCancellationOperationReservation(): void {
        this.failNextPaymentCancellationReservation = true;
    }

    setStripeAccountState(userId: string, patch: JsonRecord): void {
        this.stripeAccountState.set(userId, patch);
    }

    setAccountState(userId: string, patch: JsonRecord): void {
        const account = this.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account) {
            throw new Error(`unknown account ${userId}`);
        }
        this.update(account, patch);
    }

    addProviderDispute(chargeId: string, patch: JsonRecord = {}): void {
        this.providerDisputes.push({
            id: `dp_${this.providerDisputes.length + 1}`,
            charge: chargeId,
            amount: 1200,
            currency: "eur",
            reason: "fraudulent",
            status: "needs_response",
            evidence_details: { due_by: 1_800_000_000, submission_count: 0 },
            balance_transactions: [],
            ...patch,
        });
    }

    updateProviderDispute(disputeId: string, patch: JsonRecord): void {
        const dispute = this.providerDisputes.find((candidate) => candidate.id === disputeId);
        if (!dispute) {
            throw new Error(`unknown provider dispute ${disputeId}`);
        }
        Object.assign(dispute, patch);
    }

    addProviderRefund(chargeId: string, patch: JsonRecord = {}): void {
        this.providerRefunds.push({
            id: `re_external_${this.providerRefunds.length + 1}`,
            charge: chargeId,
            amount: 1200,
            currency: "eur",
            status: "succeeded",
            ...patch,
        });
    }

    patchProviderTransfer(stripeTransferId: string, patch: JsonRecord): void {
        const transfer = this.providerTransfers.find((candidate) => candidate.id === stripeTransferId);
        if (!transfer) {
            throw new Error(`unknown provider transfer ${stripeTransferId}`);
        }
        Object.assign(transfer, patch);
    }

    addProviderTransfer(transferGroup: string, patch: JsonRecord = {}): string {
        const id = `tr_external_${this.providerTransfers.length + 1}`;
        this.providerTransfers.push({
            id,
            amount: 1080,
            currency: "eur",
            destination: "acct_external_transfer",
            source_transaction: "ch_external_transfer",
            transfer_group: transferGroup,
            metadata: {},
            amount_reversed: 0,
            reversed: false,
            ...patch,
        });
        return id;
    }

    seedLocalTransferReversal(stripeTransferId: string, amount: number, status: string): void {
        const transfer = this.tables.transfers.find((row) => row.stripe_transfer_id === stripeTransferId);
        if (!transfer) {
            throw new Error(`unknown local transfer ${stripeTransferId}`);
        }
        const operation = this.insertGeneric("financial_operations", {
            payment_id: transfer.payment_id,
            business_key: `seed-transfer-reversal:${stripeTransferId}:${status}:${amount}`,
            operation_type: "transfer_reversal_create",
            status,
            request: {},
            response: null,
        });
        this.insertGeneric("transfer_reversals", {
            payment_id: transfer.payment_id,
            transfer_id: transfer.id,
            operation_id: operation.id,
            reversal_request_id: `seed-transfer-reversal:${operation.id}`,
            amount,
            currency: "eur",
            status,
        });
    }

    clearProviderRefunds(): void {
        this.providerRefunds.length = 0;
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

    patchPaymentLedger(paymentId: number, patch: JsonRecord): void {
        const payment = this.tables.payments.find((row) => same(row.id, paymentId));
        if (!payment) {
            throw new Error(`unknown payment ${paymentId}`);
        }
        this.update(payment, patch);
    }

    removePayment(paymentId: number): void {
        const index = this.tables.payments.findIndex((row) => same(row.id, paymentId));
        if (index < 0) {
            throw new Error(`unknown payment ${paymentId}`);
        }
        this.tables.payments.splice(index, 1);
    }

    omitNextPaymentRead(): void {
        this.omitNextPaymentReadResult = true;
    }

    patchRefundLedger(refundId: number, patch: JsonRecord): void {
        const refund = this.tables.refunds.find((row) => same(row.id, refundId));
        if (!refund) {
            throw new Error(`unknown refund ${refundId}`);
        }
        this.update(refund, patch);
    }

    replacePaymentIntentDuringNextRetrieve(paymentId: number, replacementId: string): void {
        this.paymentIntentReplacementOnNextRetrieve = { paymentId, replacementId };
    }

    failNextPaymentProjectionEnqueue(): void {
        this.failPaymentProjectionEnqueue = true;
    }

    failNextFinancialOperationFailureUpdate(): void {
        this.failFinancialOperationFailureUpdate = true;
    }

    failNextDisputeFileUploadOnce(): void {
        this.failDisputeFileUpload = true;
    }

    failNextPaymentIntentCreationOnce(): void {
        this.failNextPaymentIntentCreation = true;
    }

    failNextProtectedPaymentReservation(mode: "missing" | "raced"): void {
        this.nextProtectedPaymentReservationFailure = mode;
    }

    failNextPostgrestWrite(table: string, method: "POST" | "PATCH"): void {
        this.nextPostgrestWriteFailure = { table, method };
    }

    linkNextProtectedPaymentReservationToIntent(): void {
        this.linkNextProtectedPaymentReservation = true;
    }

    quarantineNextPaymentIntentProjection(): void {
        this.nextPaymentIntentProjectionManualReview = true;
    }

    setNextProtectedPaymentProjectionScenario(scenario: ProtectedPaymentProjectionScenario): void {
        this.nextProtectedPaymentProjectionScenario = scenario;
    }

    succeedNextPaymentIntentOperation(): void {
        this.nextPaymentIntentOperationSucceeded = true;
    }

    failNextProviderExceptionResolution(): void {
        this.failProviderExceptionResolution = true;
    }

    failNextPaymentReconciliationLedgerRead(): void {
        this.failPaymentReconciliationLedgerRead = true;
    }

    failNextPaymentReconciliationLocalContextRead(): void {
        this.failPaymentReconciliationLocalContextRead = true;
    }

    loseNextPaymentProjectionEnqueueResponse(): void {
        this.losePaymentProjectionEnqueueResponse = true;
    }

    failNextPaymentIntentRetrieve(): void {
        this.failPaymentIntentRetrieve = true;
    }

    failProviderTransferContextReadAfter(successfulReads: number): void {
        this.providerTransferContextReadsBeforeFailure = successfulReads;
    }

    failNextProviderDisputeList(): void {
        this.failProviderDisputeList = true;
    }

    failNextProviderRefundList(): void {
        this.failProviderRefundList = true;
    }

    failNextProviderTransferList(): void {
        this.failProviderTransferList = true;
    }

    seedTerminalOperationRecovery(kind: OperationRecoveryKind): TerminalOperationRecoverySeed {
        const paymentId = this.seedDashboardPayment(`terminal-${kind}-recovery`, {
            stripe_charge_id: "ch_terminal_operation_recovery",
            transferred_amount: kind === "refund" ? 0 : 1080,
            settlement_status: kind === "refund" ? "refund_pending" : "released",
        });
        const request =
            kind === "transfer"
                ? {
                      releaseAuthorizationId: "release-terminal-operation-recovery",
                      releaseKind: "initial",
                      amount: 1080,
                      currency: "eur",
                  }
                : kind === "reversal"
                  ? {
                        recoveryRequestId: "recovery-terminal-operation-recovery",
                        reversalRequestId: "reversal-terminal-operation-recovery",
                        transferId: "tr_terminal_operation_recovery",
                        amount: 1080,
                        currency: "eur",
                        allocationIndex: 1,
                    }
                  : {
                        refundRequestId: "refund-terminal-operation-recovery",
                        commerceRefundRequestId: 701,
                        amount: 1200,
                        requiredReversalAmount: 0,
                        sellerEntitlementReductionAmount: 0,
                        authorizedSellerAmount: 1080,
                        currency: "eur",
                    };
        const operation = this.insertGeneric("financial_operations", {
            payment_id: paymentId,
            business_key: `${kind}:terminal-operation-recovery`,
            operation_type:
                kind === "transfer"
                    ? "transfer_create"
                    : kind === "reversal"
                      ? "transfer_reversal_create"
                      : "refund_create",
            status: "failed",
            stripe_object_id: null,
            request,
            response: null,
            last_error: "simulated lost local completion response",
            attempt_count: 1,
            next_attempt_at: null,
            claimed_at: null,
            completed_at: null,
        });
        let artifact: JsonRecord;
        let providerObjectId: string;
        if (kind === "transfer") {
            providerObjectId = "tr_terminal_operation_recovery";
            artifact = this.insertGeneric("transfers", {
                payment_id: paymentId,
                operation_id: operation.id,
                release_authorization_id: "release-terminal-operation-recovery",
                release_kind: "initial",
                stripe_transfer_id: providerObjectId,
                source_charge_id: "ch_terminal_operation_recovery",
                destination_account_id: `acct_terminal-${kind}-recovery`,
                transfer_group: `group_terminal-${kind}-recovery`,
                amount: 1080,
                currency: "eur",
                status: "succeeded",
                provider_snapshot: { id: providerObjectId, status: "succeeded" },
            });
        } else if (kind === "reversal") {
            const parentOperation = this.insertGeneric("financial_operations", {
                payment_id: paymentId,
                business_key: "transfer:terminal-operation-recovery-parent",
                operation_type: "transfer_create",
                status: "succeeded",
                request: {},
                response: {},
            });
            const transfer = this.insertGeneric("transfers", {
                payment_id: paymentId,
                operation_id: parentOperation.id,
                release_authorization_id: "release-terminal-operation-recovery-parent",
                release_kind: "initial",
                stripe_transfer_id: "tr_terminal_operation_recovery",
                source_charge_id: "ch_terminal_operation_recovery",
                destination_account_id: "acct_terminal-reversal-recovery",
                transfer_group: "group_terminal-reversal-recovery",
                amount: 1080,
                currency: "eur",
                status: "reversed",
                provider_snapshot: { id: "tr_terminal_operation_recovery" },
            });
            providerObjectId = "trr_terminal_operation_recovery";
            artifact = this.insertGeneric("transfer_reversals", {
                payment_id: paymentId,
                transfer_id: transfer.id,
                operation_id: operation.id,
                reversal_request_id: "reversal-terminal-operation-recovery",
                stripe_transfer_reversal_id: providerObjectId,
                amount: 1080,
                currency: "eur",
                status: "succeeded",
                provider_snapshot: { id: providerObjectId, status: "succeeded" },
            });
        } else {
            providerObjectId = "re_terminal_operation_recovery";
            artifact = this.insertGeneric("refunds", {
                payment_id: paymentId,
                operation_id: operation.id,
                refund_request_id: "refund-terminal-operation-recovery",
                commerce_refund_request_id: 701,
                stripe_refund_id: providerObjectId,
                stripe_charge_id: "ch_terminal_operation_recovery",
                amount: 1200,
                required_reversal_amount: 0,
                seller_entitlement_reduction_amount: 0,
                authorized_seller_amount_after_refund: 1080,
                currency: "eur",
                status: "pending",
                provider_snapshot: { id: providerObjectId, status: "pending" },
            });
        }
        return {
            kind,
            paymentId,
            operationId: Number(operation.id),
            artifactId: Number(artifact.id),
            providerObjectId,
        };
    }

    seedNonterminalSettlementRelease(
        paymentId: number,
        releaseAuthorizationId: string,
    ): {
        operationId: number;
        transferId: number;
    } {
        const payment = this.tables.payments.find((row) => same(row.id, paymentId));
        if (!payment) {
            throw new Error(`unknown payment ${paymentId}`);
        }
        const operation = this.insertGeneric("financial_operations", {
            payment_id: paymentId,
            business_key: `settlement:${paymentId}:${releaseAuthorizationId}`,
            operation_type: "transfer_create",
            status: "failed",
            stripe_object_id: null,
            request: {
                releaseAuthorizationId,
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
                sourceChargeId: payment.stripe_charge_id,
                destinationAccountId: payment.seller_stripe_account_id,
                transferGroup: payment.transfer_group,
            },
            response: null,
            last_error: "simulated nonterminal Transfer operation",
            attempt_count: 1,
            next_attempt_at: null,
            claimed_at: null,
            completed_at: null,
        });
        const transfer = this.insertGeneric("transfers", {
            payment_id: paymentId,
            operation_id: operation.id,
            release_authorization_id: releaseAuthorizationId,
            release_kind: "initial",
            stripe_transfer_id: null,
            source_charge_id: payment.stripe_charge_id,
            destination_account_id: payment.seller_stripe_account_id,
            transfer_group: payment.transfer_group,
            amount: 1080,
            currency: "eur",
            status: "processing",
            provider_snapshot: null,
        });
        return { operationId: Number(operation.id), transferId: Number(transfer.id) };
    }

    seedTerminalReconciliationPage(runKey: string) {
        const createdAt = "2026-07-21T09:00:00.000Z";
        const updatedAt = "2026-07-21T09:05:00.000Z";
        const run = this.insertGeneric("reconciliation_runs", {
            run_key: runKey,
            status: "succeeded",
            scanned_count: 3,
            repaired_count: 2,
            exception_count: 0,
            details: { fixture: "terminal-provider-reconciliation" },
            started_at: createdAt,
            finished_at: updatedAt,
        });
        const paymentId = this.seedDashboardPayment("terminal-reconciliation-order", {
            stripe_payment_intent_id: "pi_terminal_reconciliation",
            stripe_charge_id: "ch_terminal_reconciliation",
            stripe_charge_balance_transaction_id: "txn_terminal_reconciliation",
            transferred_amount: 1080,
            actual_stripe_charge_fee_amount: 65,
            actual_stripe_processing_fee_amount: 65,
            actual_stripe_charge_net_amount: 1135,
            actual_stripe_fee_currency: "eur",
            actual_stripe_charge_fee_details: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
            settlement_status: "released",
            dispute_status: "open",
            description: "Terminal reconciliation fixture",
            paid_at: createdAt,
            last_provider_sync_at: updatedAt,
            created_at: createdAt,
            updated_at: updatedAt,
        });
        const operation = this.insertGeneric("financial_operations", {
            payment_id: paymentId,
            business_key: "transfer:terminal-reconciliation",
            operation_type: "transfer_create",
            status: "succeeded",
            stripe_object_id: "tr_terminal_reconciliation",
            request: {
                amount: 1080,
                currency: "eur",
                releaseAuthorizationId: "release-terminal-reconciliation",
            },
            response: { id: "tr_terminal_reconciliation", status: "succeeded" },
            last_error: null,
            attempt_count: 1,
            next_attempt_at: null,
            claimed_at: createdAt,
            completed_at: updatedAt,
            created_at: createdAt,
            updated_at: updatedAt,
        });
        const dispute = this.insertGeneric("stripe_disputes", {
            payment_id: paymentId,
            stripe_dispute_id: "dp_terminal_reconciliation",
            stripe_charge_id: "ch_terminal_reconciliation",
            amount: 1200,
            currency: "eur",
            reason: "fraudulent",
            status: "needs_response",
            evidence_status: "staged",
            evidence_due_by: "2026-07-28T09:00:00.000Z",
            is_charge_refundable: false,
            funds_withdrawn: true,
            last_funds_event_at: createdAt,
            last_funds_event_id: "evt_terminal_reconciliation",
            balance_transaction_ids: ["txn_dispute_terminal_reconciliation"],
            provider_snapshot: { id: "dp_terminal_reconciliation", status: "needs_response" },
            created_at: createdAt,
            updated_at: updatedAt,
        });
        this.insertGeneric("stripe_dispute_evidence", {
            dispute_id: dispute.id,
            evidence_operation_id: "evidence-terminal-reconciliation",
            staged_at: createdAt,
            submitted_at: updatedAt,
        });
        this.insertGeneric("irreversible_dispute_action_approvals", {
            dispute_id: dispute.id,
            action_type: "dispute_accept",
            status: "pending_second_approval",
            first_actor_id: "admin-first",
            first_approved_at: createdAt,
            second_actor_id: null,
            second_approved_at: null,
            created_at: createdAt,
        });
        const projection = (kind: string, key: string, values: JsonRecord) =>
            this.insertGeneric("commerce_projection_outbox", {
                operation_id: null,
                payment_id: paymentId,
                projection_key: key,
                projection_kind: kind,
                provider_object_id: null,
                projection_payload: {},
                recovery_key: null,
                projection_status: "pending",
                attempt_count: 0,
                next_attempt_at: null,
                claim_owner: null,
                claim_token: null,
                claimed_at: null,
                last_error: null,
                projected_at: null,
                intervention_revision: 0,
                ...values,
            });
        const paymentKey = "terminal:payment";
        const operationKey = "terminal:transfer";
        const disputeKey = "terminal:dispute";
        const paymentProjection = projection("payment", paymentKey, {
            provider_object_id: String(paymentId),
            causal_sequence: 10,
            created_at: "2026-07-21T09:10:00.000Z",
        });
        const operationProjection = projection("transfer", operationKey, {
            operation_id: operation.id,
            provider_object_id: "tr_terminal_reconciliation",
            causal_sequence: 20,
            created_at: "2026-07-21T09:11:00.000Z",
        });
        const disputeProjection = projection("dispute", disputeKey, {
            provider_object_id: String(dispute.id),
            causal_sequence: 30,
            created_at: "2026-07-21T09:12:00.000Z",
        });
        return {
            runId: Number(run.id),
            runKey,
            paymentId,
            operationId: Number(operation.id),
            disputeRowId: Number(dispute.id),
            paymentProjectionId: Number(paymentProjection.id),
            operationProjectionId: Number(operationProjection.id),
            disputeProjectionId: Number(disputeProjection.id),
            paymentProjectionKey: paymentKey,
            operationProjectionKey: operationKey,
            disputeProjectionKey: disputeKey,
        };
    }

    removeTerminalReconciliationDispute(disputeRowId: number): void {
        const index = this.tables.stripe_disputes.findIndex((row) => same(row.id, disputeRowId));
        if (index < 0) {
            throw new Error(`unknown terminal reconciliation dispute ${disputeRowId}`);
        }
        this.tables.stripe_disputes.splice(index, 1);
    }

    injectInFlightTransferBeforeNextRefundReservation(paymentId: number, amount: number): void {
        this.inFlightTransferBeforeRefund = { paymentId, amount };
    }

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

    private async waitForPostgrestRead(table: string): Promise<void> {
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

    seedDispute(disputeId: string, status: string, evidenceStatus: string, submitted: boolean): void {
        const now = "2026-07-06T12:00:00.000Z";
        if (!this.tables.payments.some((row) => row.id === 999)) {
            this.tables.payments.push({
                id: 999,
                client_reference_id: "order-dispute-seed",
                financial_terms_hash: financialTermsHash,
                financial_revision: 1,
                dual_approval_threshold_amount: 1000,
                buyer_cms_user_id: "buyer-seed",
                seller_cms_user_id: "seller-seed",
                seller_stripe_account_id: "acct_seller_seed",
                stripe_payment_intent_id: "pi_dispute_seed",
                stripe_charge_id: "ch_disputed",
                stripe_charge_balance_transaction_id: "txn_charge_dispute_seed",
                last_stripe_event_id: null,
                transfer_group: "cms_order_dispute_seed",
                currency: "eur",
                amount_total: 1200,
                seller_transfer_amount: 1080,
                platform_retained_amount: 120,
                refunded_amount: 0,
                transferred_amount: 0,
                reversed_amount: 0,
                actual_stripe_charge_fee_amount: 65,
                actual_stripe_refund_fee_amount: 0,
                actual_stripe_processing_fee_amount: 65,
                actual_stripe_charge_net_amount: 1135,
                actual_stripe_fee_currency: "eur",
                actual_stripe_charge_fee_details: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
                payment_status: "succeeded",
                settlement_status: "blocked",
                dispute_status: "open",
                description: null,
                manual_review_reason: null,
                paid_at: now,
                cancelled_at: null,
                last_provider_sync_at: now,
                created_at: now,
                updated_at: now,
            });
        }
        const disputeRowId = this.nextRowId++;
        this.tables.stripe_disputes.push({
            id: disputeRowId,
            payment_id: 999,
            stripe_dispute_id: disputeId,
            stripe_charge_id: "ch_disputed",
            amount: 1200,
            currency: "eur",
            reason: "fraudulent",
            status,
            evidence_status: evidenceStatus,
            evidence_due_by: "2099-07-06T12:00:00.000Z",
            is_charge_refundable: false,
            balance_transaction_ids: [],
            provider_snapshot: { id: disputeId, status },
            created_at: now,
            updated_at: now,
        });
        this.tables.stripe_dispute_evidence.push({
            id: this.nextRowId++,
            dispute_id: disputeRowId,
            evidence_operation_id: `evidence-${disputeId}`,
            evidence: { uncategorized_text: "Evidence" },
            staged_by: "finance-user",
            staged_at: now,
            submitted_operation_id: submitted ? 88 : null,
            submitted_at: submitted ? now : null,
        });
    }

    seedAbandonedStripeEvent(): void {
        this.tables.stripe_events.push({
            id: this.nextRowId++,
            stripe_account_id: "platform",
            event_id: "evt_abandoned",
            event_type: "test_helpers.test_clock.ready",
            object_id: "clock_abandoned",
            api_version: "2026-02-25.clover",
            livemode: false,
            provider_created_at: "2026-07-06T10:00:00.000Z",
            payload_sha256: "a".repeat(64),
            payload: {
                id: "evt_abandoned",
                type: "test_helpers.test_clock.ready",
                data: { object: { id: "clock_abandoned" } },
            },
            processing_status: "processing",
            attempt_count: 1,
            processing_started_at: "2026-07-06T10:00:00.000Z",
            last_error: null,
            received_at: "2026-07-06T10:00:00.000Z",
            processed_at: null,
        });
    }

    seedPendingStripeEvents(count: number): void {
        for (let index = 0; index < count; index++) {
            const eventId = `evt_pending_backlog_${index + 1}`;
            this.tables.stripe_events.push({
                id: this.nextRowId++,
                stripe_account_id: "platform",
                event_id: eventId,
                event_type: "test_helpers.test_clock.ready",
                object_id: `clock_pending_${index + 1}`,
                api_version: "2026-02-25.clover",
                livemode: false,
                provider_created_at: "2026-07-06T10:00:00.000Z",
                payload_sha256: "b".repeat(64),
                payload: {
                    id: eventId,
                    type: "test_helpers.test_clock.ready",
                    data: { object: { id: `clock_pending_${index + 1}` } },
                },
                processing_status: "pending",
                attempt_count: 0,
                processing_started_at: null,
                last_error: null,
                received_at: "2026-07-06T10:00:00.000Z",
                processed_at: null,
            });
        }
    }

    seedFailedSellerRiskHoldOperation(userId: string, appliedMinimum: number): number {
        const account = this.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account?.stripe_account_id) {
            throw new Error(`unknown connected account ${userId}`);
        }
        this.setConnectedPayoutSettings("manual", appliedMinimum);
        const operation = this.insertGeneric("financial_operations", {
            payment_id: null,
            business_key: `seller-risk-hold:${userId}:lost-database-response`,
            operation_type: "payout_schedule_update",
            status: "failed",
            stripe_object_id: null,
            request: {
                cmsUserId: userId,
                stripeAccountId: account.stripe_account_id,
                restoreSettings: {
                    interval: "daily",
                    minimumBalanceEur: 0,
                    debitNegativeBalances: false,
                },
                interval: "manual",
                minimumBalanceEur: appliedMinimum,
                debitNegativeBalances: true,
                reason: "Seller recovery exposure hold",
            },
            response: null,
            last_error: "connection closed after Stripe committed the update",
            attempt_count: 1,
            next_attempt_at: null,
            claimed_at: null,
            completed_at: null,
        });
        return Number(operation.id);
    }

    seedLegacyRecipientAccount(userId: string): void {
        const now = "2026-07-06T11:00:00.000Z";
        this.tables.accounts.push({
            ...defaultAccountRow(userId, now),
            stripe_account_id: `acct_${userId.replace(/[^a-z0-9]+/gi, "_")}_legacy`,
            stripe_account_api_version: "v1",
        });
        this.stripeAccountState.set(userId, {
            payouts_enabled: false,
            details_submitted: false,
            tos_acceptance: { service_agreement: "recipient" },
        });
    }

    seedActiveLegacyAccount(userId: string): void {
        const now = "2026-07-06T11:00:00.000Z";
        this.tables.accounts.push({
            ...defaultAccountRow(userId, now),
            stripe_account_id: `acct_${userId.replace(/[^a-z0-9]+/gi, "_")}_active_legacy`,
            stripe_account_api_version: "v1",
        });
        this.stripeAccountState.set(userId, {
            payouts_enabled: true,
            details_submitted: true,
            tos_acceptance: { service_agreement: "full" },
        });
    }

    seedPayoutScheduleAccount(userId: string, connected: boolean): void {
        const now = "2026-07-06T12:00:00.000Z";
        this.tables.accounts.push({
            ...defaultAccountRow(userId, now),
            stripe_account_id: connected ? `acct_payout_schedule_${userId.replace(/[^a-z0-9]+/gi, "_")}` : null,
            stripe_account_api_version: "v2",
            application_controlled_recipient: true,
            terms_accepted: true,
            business_type: "individual",
            onboarding_status: "enabled",
            payouts_enabled: true,
            details_submitted: true,
            capabilities: {
                stripe_balance: {
                    stripe_transfers: { status: "active", status_details: [] },
                    payouts: { status: "active", status_details: [] },
                },
            },
        });
    }

    seedHostedV2AccountWithRequirements(userId: string): void {
        const now = "2026-07-06T11:00:00.000Z";
        this.tables.accounts.push({
            ...defaultAccountRow(userId, now),
            stripe_account_id: `acct_${userId.replace(/[^a-z0-9]+/gi, "_")}_hosted_v2`,
            stripe_account_api_version: "v2",
            onboarding_status: "requirements_due",
        });
        this.stripeAccountState.set(userId, {
            dashboard: "express",
            defaults: {
                currency: "eur",
                responsibilities: {
                    fees_collector: "application",
                    losses_collector: "application",
                    requirements_collector: "stripe",
                },
            },
            requirements: {
                entries: [
                    {
                        awaiting_action_from: "user",
                        description: "identity.individual.attestations.terms_of_service",
                        errors: [],
                        minimum_deadline: { status: "currently_due" },
                    },
                ],
                summary: { minimum_deadline: { status: "currently_due" } },
            },
        });
    }

    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        if (init?.body instanceof FormData) {
            const purpose = init.body.get("purpose");
            const file = init.body.get("file");
            if (typeof purpose !== "string" || !file || typeof file === "string") {
                throw new Error("invalid Stripe file upload form data");
            }
            this.fileUploadRequests.push({
                purpose,
                fileName: file.name,
                mimeType: file.type,
                content: Array.from(new Uint8Array(await file.arrayBuffer())),
            });
        }
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();

        if (url.origin === stripeUrl) {
            this.externalRequestOrder.push(`stripe:${method}:${url.pathname}`);
            return await fetchStripeProvider(this, request, url, method);
        }
        if (url.origin !== supabaseUrl || !url.pathname.startsWith("/rest/v1/")) {
            throw new Error(`unexpected fetch: ${method} ${request.url}`);
        }

        expect(request.headers.get("apikey")).toBe("supabase-secret-key");
        expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
        expect(request.headers.get("accept-profile")).toBe("stripe_connect");
        if (method !== "GET" && method !== "HEAD") {
            expect(request.headers.get("content-profile")).toBe("stripe_connect");
        }
        const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
        this.externalRequestOrder.push(`postgrest:${method}:${table}`);
        this.postgrestRequests.push({
            method,
            table,
            searchParams: Array.from(url.searchParams.entries()),
            body:
                method === "POST" || method === "PATCH"
                    ? ((await request
                          .clone()
                          .json()
                          .catch(() => null)) as JsonRecord | null)
                    : null,
        });
        if (this.nextPostgrestWriteFailure?.table === table && this.nextPostgrestWriteFailure.method === method) {
            this.nextPostgrestWriteFailure = null;
            return jsonResponse({ message: `simulated ${table} ${method} failure` }, 500);
        }
        if (table === "provider_exceptions" && method === "PATCH" && this.failProviderExceptionResolution) {
            this.failProviderExceptionResolution = false;
            return jsonResponse({ message: "simulated provider exception resolution failure" }, 500);
        }
        const isPaymentReconciliationLedgerRead =
            (table === "rpc/read_payment_reconciliation_ledger" && method === "POST") ||
            (table === "transfers" && method === "GET");
        if (isPaymentReconciliationLedgerRead && this.failPaymentReconciliationLedgerRead) {
            this.failPaymentReconciliationLedgerRead = false;
            return jsonResponse({ message: "simulated payment ledger read failure" }, 500);
        }
        if (
            table === "rpc/read_payment_reconciliation_local_context" &&
            method === "POST" &&
            this.failPaymentReconciliationLocalContextRead
        ) {
            this.failPaymentReconciliationLocalContextRead = false;
            return jsonResponse({ message: "simulated payment reconciliation local context read failure" }, 500);
        }
        const isProviderTransferContextRead =
            table === "rpc/read_provider_transfer_reconciliation_context" ||
            (table === "transfers" && method === "GET" && url.searchParams.has("stripe_transfer_id"));
        if (isProviderTransferContextRead && this.providerTransferContextReadsBeforeFailure !== null) {
            if (this.providerTransferContextReadsBeforeFailure === 0) {
                this.providerTransferContextReadsBeforeFailure = null;
                return jsonResponse({ message: "simulated provider transfer context read failure" }, 500);
            }
            this.providerTransferContextReadsBeforeFailure--;
        }
        if (table === "rpc/list_dashboard_refunds" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const rows = this.dashboardPage("refunds", body, ["refund_request_id", "stripe_refund_id"]);
            return jsonResponse(
                rows.map((refund) => ({
                    refund,
                    client_reference_id: this.requiredDashboardPayment(refund.payment_id).client_reference_id,
                })),
            );
        }
        if (table === "rpc/read_dashboard_disputes" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const rows = this.dashboardPage(
                "stripe_disputes",
                body,
                ["stripe_dispute_id", "stripe_charge_id", "reason"],
                "stripe_dispute_id",
            );
            return jsonResponse(
                rows.map((dispute) => {
                    const evidence = this.tables.stripe_dispute_evidence.filter((row) =>
                        same(row.dispute_id, dispute.id),
                    );
                    const pendingApproval = this.tables.irreversible_dispute_action_approvals.find(
                        (row) => same(row.dispute_id, dispute.id) && row.status === "pending_second_approval",
                    );
                    return {
                        dispute,
                        client_reference_id: this.requiredDashboardPayment(dispute.payment_id).client_reference_id,
                        staged_evidence: evidence[0] ?? null,
                        evidence_submission_count: evidence.filter((row) => row.submitted_at).length,
                        pending_approval: pendingApproval ?? null,
                    };
                }),
            );
        }
        if (table === "rpc/list_dashboard_financial_operations" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const rows = this.dashboardPage("financial_operations", body, [
                "business_key",
                "stripe_object_id",
                "last_error",
            ]);
            return jsonResponse(
                rows.map((operation) => {
                    const payment = operation.payment_id ? this.requiredDashboardPayment(operation.payment_id) : null;
                    return {
                        operation,
                        client_reference_id: payment?.client_reference_id ?? null,
                        payment_currency: payment?.currency ?? null,
                    };
                }),
            );
        }
        if (table === "rpc/reserve_protected_payment" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const payment = asRecord(body.p_payment);
            const reference = String(payment.client_reference_id);
            if (this.nextProtectedPaymentReservationFailure === "missing") {
                this.nextProtectedPaymentReservationFailure = null;
                return jsonResponse({ message: "simulated protected payment reservation failure" }, 500);
            }
            let guard = this.tables.payment_lifecycle_guards.find((row) => row.client_reference_id === reference);
            if (guard?.cancellation_request_id) {
                return jsonResponse(
                    { message: "conflict: protected payment creation was cancelled before provider creation" },
                    400,
                );
            }
            const existing = this.tables.payments.find((row) => row.client_reference_id === reference);
            const reserved = existing ?? this.insertPayment(payment);
            const stored = this.tables.payments.find((row) => row.client_reference_id === reference)!;
            if (!guard) {
                guard = this.insertGeneric("payment_lifecycle_guards", {
                    client_reference_id: reference,
                    payment_id: stored.id,
                    cancellation_request_id: null,
                    cancellation_reason: null,
                    cancellation_requested_at: null,
                    payment_linked_at: reserved.created_at,
                });
            } else {
                this.update(guard, {
                    payment_id: reserved.id,
                    payment_linked_at: guard.payment_linked_at ?? reserved.created_at,
                });
            }
            if (this.linkNextProtectedPaymentReservation) {
                this.linkNextProtectedPaymentReservation = false;
                const intent = this.seedPaymentIntent(stored);
                this.update(stored, { stripe_payment_intent_id: intent.id });
            }
            if (this.nextProtectedPaymentReservationFailure === "raced") {
                this.nextProtectedPaymentReservationFailure = null;
                return jsonResponse({ message: "simulated protected payment reservation failure" }, 500);
            }
            return jsonResponse({ ...stored });
        }
        if (table === "rpc/apply_payment_provider_projection" && method === "POST") {
            return this.applyPaymentProviderProjection(JSON.parse(await request.text()) as JsonRecord);
        }
        if (table === "rpc/recover_transient_provider_truth_review" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const paymentId = Number(body.p_payment_id);
            const payment = this.tables.payments.find((row) => same(row.id, paymentId));
            if (!payment) {
                return jsonResponse({ message: "not_found: payment" }, 400);
            }
            const reason = "Stripe payment provider truth mismatch: charge_balance_transaction_expansion";
            const exceptionKey = `provider-payment-truth:${paymentId}:${body.p_payment_intent_id}`;
            const hasRecoveryException = this.tables.provider_exceptions.some(
                (row) =>
                    same(row.payment_id, paymentId) &&
                    ["open", "investigating"].includes(String(row.status)) &&
                    row.deduplication_key === exceptionKey,
            );
            const hasOtherException = this.tables.provider_exceptions.some(
                (row) =>
                    same(row.payment_id, paymentId) &&
                    ["open", "investigating"].includes(String(row.status)) &&
                    row.deduplication_key !== exceptionKey,
            );
            const recovered =
                payment.payment_status === "succeeded" &&
                payment.settlement_status === "manual_review" &&
                payment.manual_review_reason === reason &&
                payment.stripe_payment_intent_id === body.p_payment_intent_id &&
                payment.stripe_charge_id === body.p_charge_id &&
                payment.stripe_charge_balance_transaction_id === body.p_balance_transaction_id &&
                Number(payment.transferred_amount) === 0 &&
                Number(payment.reversed_amount) === 0 &&
                Number(payment.refunded_amount) === 0 &&
                payment.dispute_status === "none" &&
                hasRecoveryException &&
                !hasOtherException;
            if (!recovered) {
                return jsonResponse({ recovered: false, payment });
            }
            this.update(payment, { settlement_status: "held", manual_review_reason: null });
            for (const exception of this.tables.provider_exceptions) {
                if (
                    exception.deduplication_key !== exceptionKey ||
                    !["open", "investigating"].includes(String(exception.status))
                ) {
                    continue;
                }
                this.update(exception, {
                    status: "resolved",
                    resolved_at: "2026-07-06T12:10:00.000Z",
                    resolved_by: "provider-truth-revalidation",
                });
            }
            this.insertGeneric("payment_events", {
                payment_id: paymentId,
                event_type: "provider_payment_truth_revalidated",
                actor_kind: body.p_actor_kind,
                actor_id: body.p_actor_id,
                previous_payment_status: "succeeded",
                next_payment_status: "succeeded",
                previous_settlement_status: "manual_review",
                next_settlement_status: "held",
                data: {
                    resolvedReason: reason,
                    paymentIntentId: body.p_payment_intent_id,
                    chargeId: body.p_charge_id,
                    balanceTransactionId: body.p_balance_transaction_id,
                },
            });
            return jsonResponse({ recovered: true, payment });
        }
        if (table === "rpc/record_marketplace_terms_acceptance" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const userId = String(body.p_cms_user_id);
            const version = String(body.p_terms_version);
            const hash = String(body.p_terms_hash);
            const account = this.tables.accounts.find((row) => row.cms_user_id === userId);
            if (!account) {
                return jsonResponse({ message: "not_found: Stripe Connect account" }, 400);
            }
            let acceptance = this.tables.marketplace_terms_acceptances.find(
                (row) => row.cms_user_id === userId && row.terms_version === version,
            );
            if (acceptance && acceptance.terms_hash !== hash) {
                return jsonResponse(
                    { message: "conflict: marketplace terms version is already bound to another document hash" },
                    400,
                );
            }
            if (!acceptance) {
                acceptance = {
                    cms_user_id: userId,
                    terms_version: version,
                    terms_hash: hash,
                    accepted_at: "2026-07-06T12:03:00.000Z",
                };
                this.tables.marketplace_terms_acceptances.push(acceptance);
            }
            const previousAcceptedAt = Date.parse(String(account.marketplace_terms_accepted_at ?? ""));
            const acceptedAt = Date.parse(String(acceptance.accepted_at));
            if (!Number.isFinite(previousAcceptedAt) || acceptedAt >= previousAcceptedAt) {
                this.update(account, {
                    marketplace_terms_version: acceptance.terms_version,
                    marketplace_terms_hash: acceptance.terms_hash,
                    marketplace_terms_accepted_at: acceptance.accepted_at,
                });
            }
            if (this.failAccountReloadAfterTermsAcceptance) {
                this.failAccountReloadAfterTermsAcceptance = false;
                this.omitNextAccountRead = true;
            }
            return jsonResponse(acceptance);
        }
        if (table === "rpc/reserve_payment_cancellation_intent" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const reference = String(body.p_client_reference_id);
            const cancellationRequestId = String(body.p_cancellation_request_id);
            const reason =
                typeof body.p_reason === "string" && body.p_reason.trim()
                    ? body.p_reason.trim()
                    : "Commerce requested provider payment cancellation";
            const payment = this.tables.payments.find((row) => row.client_reference_id === reference);
            let guard = this.tables.payment_lifecycle_guards.find((row) => row.client_reference_id === reference);
            if (
                guard?.cancellation_request_id &&
                (guard.cancellation_request_id !== cancellationRequestId || guard.cancellation_reason !== reason)
            ) {
                return jsonResponse({ message: "conflict: payment cancellation intent replay mismatch" }, 400);
            }
            if (!guard) {
                guard = this.insertGeneric("payment_lifecycle_guards", {
                    client_reference_id: reference,
                    payment_id: payment?.id ?? null,
                    cancellation_request_id: cancellationRequestId,
                    cancellation_reason: reason,
                    cancellation_requested_at: "2026-07-06T12:04:00.000Z",
                    payment_linked_at: payment?.created_at ?? null,
                });
            } else if (!guard.cancellation_request_id) {
                guard = this.update(guard, {
                    cancellation_request_id: cancellationRequestId,
                    cancellation_reason: reason,
                    cancellation_requested_at: "2026-07-06T12:04:00.000Z",
                });
            }
            return jsonResponse({
                clientReferenceId: reference,
                cancellationRequestId,
                paymentId: guard.payment_id,
                providerPaymentAbsent: guard.payment_id === null || guard.payment_id === undefined,
                requestedAt: guard.cancellation_requested_at,
            });
        }
        if (
            (table === "rpc/reserve_financial_operation" || table === "rpc/reserve_payment_cancellation_operation") &&
            method === "POST"
        ) {
            let body = JSON.parse(await request.text()) as JsonRecord;
            let cancellationPayment: JsonRecord | undefined;
            if (table === "rpc/reserve_payment_cancellation_operation") {
                await this.waitForPostgrestRead("payments");
                const payment = this.tables.payments.find((row) => same(row.id, body.p_payment_id));
                if (!payment || payment.client_reference_id !== body.p_client_reference_id) {
                    return jsonResponse(
                        {
                            message:
                                "conflict: payment cancellation lifecycle guard does not match provider payment truth",
                        },
                        400,
                    );
                }
                cancellationPayment = structuredClone(payment);
                body = { ...body, p_operation_type: "payment_intent_cancel" };
            }
            if (body.p_operation_type === "payment_intent_cancel" && this.failNextPaymentCancellationReservation) {
                this.failNextPaymentCancellationReservation = false;
                return jsonResponse({ message: "conflict: simulated payment cancellation reservation failure" }, 400);
            }
            const businessKey = String(body.p_business_key);
            const existing = this.tables.financial_operations.find((row) => row.business_key === businessKey);
            if (existing) {
                return jsonResponse(
                    cancellationPayment ? { payment: cancellationPayment, operation: existing } : existing,
                );
            }
            const operationRequest = asRecord(body.p_request);
            if (
                body.p_operation_type === "refund_create" &&
                this.inFlightTransferBeforeRefund &&
                same(this.inFlightTransferBeforeRefund.paymentId, body.p_payment_id)
            ) {
                const payment = this.tables.payments.find((row) => same(row.id, body.p_payment_id));
                const inFlight = this.inFlightTransferBeforeRefund;
                this.inFlightTransferBeforeRefund = null;
                this.insertGeneric("transfers", {
                    payment_id: body.p_payment_id,
                    operation_id: this.nextRowId++,
                    release_authorization_id: `in-flight-before-refund-${body.p_payment_id}`,
                    release_kind: "initial",
                    stripe_transfer_id: null,
                    source_charge_id: payment?.stripe_charge_id,
                    destination_account_id: payment?.seller_stripe_account_id,
                    transfer_group: payment?.transfer_group,
                    amount: inFlight.amount,
                    currency: payment?.currency,
                    status: "processing",
                    provider_snapshot: null,
                });
            }
            if (body.p_operation_type === "refund_create") {
                const unresolved = this.tables.financial_operations.some(
                    (row) =>
                        same(row.payment_id, body.p_payment_id) &&
                        row.operation_type === "refund_create" &&
                        ["reserved", "processing", "manual_review"].includes(String(row.status)),
                );
                if (unresolved) {
                    return jsonResponse(
                        { message: "conflict: another refund is awaiting terminal provider confirmation" },
                        400,
                    );
                }
                const payment = this.tables.payments.find((row) => same(row.id, body.p_payment_id));
                const priorReduction = this.tables.financial_operations
                    .filter(
                        (row) =>
                            same(row.payment_id, body.p_payment_id) &&
                            row.operation_type === "refund_create" &&
                            row.status !== "failed",
                    )
                    .reduce((sum, row) => sum + Number(asRecord(row.request).sellerEntitlementReductionAmount ?? 0), 0);
                const expectedAuthorized =
                    Number(payment?.seller_transfer_amount ?? 0) -
                    priorReduction -
                    Number(operationRequest.sellerEntitlementReductionAmount ?? 0);
                const transferred = this.tables.transfers
                    .filter(
                        (row) =>
                            same(row.payment_id, body.p_payment_id) &&
                            ["reserved", "processing", "succeeded", "partially_reversed", "reversed"].includes(
                                String(row.status),
                            ),
                    )
                    .reduce((sum, row) => sum + Number(row.amount), 0);
                const reversed = this.tables.transfer_reversals
                    .filter((row) => same(row.payment_id, body.p_payment_id) && row.status === "succeeded")
                    .reduce((sum, row) => sum + Number(row.amount), 0);
                if (
                    expectedAuthorized !== Number(operationRequest.authorizedSellerAmount) ||
                    transferred - reversed > expectedAuthorized
                ) {
                    return jsonResponse(
                        { message: "conflict: required Transfer Reversal is not confirmed or a Transfer is in flight" },
                        400,
                    );
                }
            }
            const now = "2026-07-06T12:04:00.000Z";
            const operation = {
                id: this.nextRowId++,
                payment_id: body.p_payment_id,
                business_key: businessKey,
                operation_type: body.p_operation_type,
                status: "reserved",
                stripe_object_id: null,
                request: body.p_request,
                response: null,
                last_error: null,
                attempt_count: 0,
                next_attempt_at: null,
                created_at: now,
                updated_at: now,
            };
            if (body.p_operation_type === "payment_intent_create" && this.nextPaymentIntentOperationSucceeded) {
                this.nextPaymentIntentOperationSucceeded = false;
                const payment = this.tables.payments.find((row) => same(row.id, body.p_payment_id));
                if (!payment) {
                    throw new Error(`unknown payment ${String(body.p_payment_id)}`);
                }
                const intent = this.seedPaymentIntent(payment);
                Object.assign(operation, {
                    status: "succeeded",
                    stripe_object_id: intent.id,
                    response: intent,
                    attempt_count: 1,
                    claimed_at: now,
                    completed_at: now,
                });
            }
            if (body.p_operation_type === "refund_create" && this.nextRefundOperationSucceeded) {
                this.nextRefundOperationSucceeded = false;
                const amount = Number(operationRequest.amount);
                const refund = {
                    id: "re_operation_succeeded",
                    charge: operationRequest.chargeId,
                    amount,
                    currency: operationRequest.currency,
                    status: "succeeded",
                    metadata: {
                        refund_request_id: operationRequest.refundRequestId,
                        commerce_reason: operationRequest.reason,
                    },
                    balance_transaction: {
                        id: "txn_refund_operation_succeeded",
                        amount: -amount,
                        fee: 0,
                        net: -amount,
                        currency: operationRequest.currency,
                        fee_details: [],
                    },
                };
                this.providerRefunds.push(refund);
                Object.assign(operation, {
                    status: "succeeded",
                    stripe_object_id: refund.id,
                    response: refund,
                    attempt_count: 1,
                    claimed_at: now,
                    completed_at: now,
                });
            }
            this.tables.financial_operations.push(operation);
            return jsonResponse(cancellationPayment ? { payment: cancellationPayment, operation } : operation);
        }
        if (table === "rpc/reserve_transfer_recovery" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const recoveryRequestId = String(body.p_recovery_request_id);
            let recovery = this.tables.transfer_recovery_requests.find(
                (row) => row.recovery_request_id === recoveryRequestId,
            );
            if (!recovery) {
                const payment = this.tables.payments.find((row) => same(row.id, body.p_payment_id));
                if (!payment) {
                    return jsonResponse({ message: "not_found: payment" }, 400);
                }
                const now = "2026-07-06T12:04:00.000Z";
                recovery = this.insertGeneric("transfer_recovery_requests", {
                    payment_id: body.p_payment_id,
                    recovery_request_id: recoveryRequestId,
                    exposure_type: body.p_exposure_type,
                    requested_amount: body.p_amount,
                    allocated_amount: 0,
                    confirmed_amount: 0,
                    allocation_shortfall_amount: body.p_amount,
                    currency: payment.currency,
                    reason: body.p_reason,
                    allocation_strategy: "newest_first",
                    status: "reserved",
                    last_error: null,
                });
                let remaining = Number(body.p_amount);
                let allocationIndex = 0;
                const transfers = this.tables.transfers
                    .filter(
                        (row) =>
                            same(row.payment_id, body.p_payment_id) &&
                            ["succeeded", "partially_reversed"].includes(String(row.status)) &&
                            typeof row.stripe_transfer_id === "string",
                    )
                    .sort(
                        (left, right) =>
                            String(right.created_at).localeCompare(String(left.created_at)) ||
                            Number(right.id) - Number(left.id),
                    );
                for (const transfer of transfers) {
                    const reserved = this.tables.transfer_reversals
                        .filter(
                            (row) =>
                                same(row.transfer_id, transfer.id) &&
                                ["reserved", "processing", "succeeded", "manual_review"].includes(String(row.status)),
                        )
                        .reduce((sum, row) => sum + Number(row.amount), 0);
                    const allocationAmount = Math.min(remaining, Math.max(0, Number(transfer.amount) - reserved));
                    if (allocationAmount <= 0) {
                        continue;
                    }
                    allocationIndex++;
                    const childKey = `${recoveryRequestId}:part:${allocationIndex}:transfer:${transfer.id}`;
                    const operation = this.insertGeneric("financial_operations", {
                        payment_id: body.p_payment_id,
                        business_key: `reversal:${body.p_payment_id}:${childKey}`,
                        operation_type: "transfer_reversal_create",
                        status: "reserved",
                        stripe_object_id: null,
                        request: {
                            recoveryRequestId,
                            reversalRequestId: childKey,
                            transferId: transfer.stripe_transfer_id,
                            amount: allocationAmount,
                            currency: payment.currency,
                            reason: body.p_reason,
                            allocationIndex,
                        },
                        response: null,
                        last_error: null,
                        attempt_count: 0,
                        next_attempt_at: null,
                        claimed_at: null,
                        completed_at: null,
                        created_at: now,
                        updated_at: now,
                    });
                    this.insertGeneric("transfer_reversals", {
                        payment_id: body.p_payment_id,
                        recovery_id: recovery.id,
                        allocation_index: allocationIndex,
                        transfer_id: transfer.id,
                        operation_id: operation.id,
                        reversal_request_id: childKey,
                        stripe_transfer_reversal_id: null,
                        amount: allocationAmount,
                        currency: payment.currency,
                        reason: body.p_reason,
                        status: "reserved",
                        provider_snapshot: null,
                    });
                    remaining -= allocationAmount;
                    if (remaining === 0 || allocationIndex === 23) {
                        break;
                    }
                }
                const recoveryRef = this.tables.transfer_recovery_requests.find((row) => same(row.id, recovery!.id));
                if (!recoveryRef) {
                    throw new Error("Transfer recovery reservation disappeared");
                }
                recovery = this.update(recoveryRef, {
                    allocated_amount: Number(body.p_amount) - remaining,
                    allocation_shortfall_amount: remaining,
                    status: Number(body.p_amount) === remaining ? "manual_review" : "reserved",
                    last_error: remaining > 0 ? "confirmed Transfers cannot cover the requested recovery" : null,
                });
            } else if (
                !same(recovery.payment_id, body.p_payment_id) ||
                !same(recovery.requested_amount, body.p_amount) ||
                recovery.exposure_type !== body.p_exposure_type ||
                recovery.reason !== body.p_reason
            ) {
                return jsonResponse({ message: "conflict: transfer recovery replay mismatch" }, 400);
            }
            const allocations = this.tables.transfer_reversals
                .filter((row) => same(row.recovery_id, recovery!.id))
                .sort((left, right) => Number(left.allocation_index) - Number(right.allocation_index))
                .map((reversal) => ({
                    reversal,
                    operation: this.tables.financial_operations.find((row) => same(row.id, reversal.operation_id)),
                    transfer: this.tables.transfers.find((row) => same(row.id, reversal.transfer_id)),
                }));
            this.applyNextTransferReversalScenario(allocations);
            return jsonResponse({ recovery, allocations });
        }
        if (table === "rpc/upsert_seller_recovery_exposure_and_refresh" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const account = this.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
            if (!account) {
                return jsonResponse({ message: "Stripe Connect account not found" }, 400);
            }
            let exposure = this.tables.seller_recovery_exposures.find(
                (row) => row.recovery_key === body.p_recovery_key,
            );
            const previousStatus = String(exposure?.status ?? "");
            const requestedStatus = String(body.p_status);
            const status = ["recovered", "waived"].includes(previousStatus)
                ? previousStatus
                : previousStatus === "debt" && requestedStatus === "at_risk"
                  ? "debt"
                  : requestedStatus;
            const amount = Math.max(Number(exposure?.amount ?? 0), Number(body.p_amount));
            const values = {
                seller_cms_user_id: body.p_seller_cms_user_id,
                payment_id: body.p_payment_id,
                recovery_key: body.p_recovery_key,
                exposure_type:
                    requestedStatus === "debt"
                        ? body.p_exposure_type
                        : (exposure?.exposure_type ?? body.p_exposure_type),
                status,
                amount,
                recovered_amount: ["recovered", "waived"].includes(status)
                    ? amount
                    : Math.min(
                          amount,
                          Math.max(Number(exposure?.recovered_amount ?? 0), Number(body.p_recovered_amount ?? 0)),
                      ),
                currency: body.p_currency,
                reason: body.p_reason,
                details: {
                    ...((exposure?.details as JsonRecord | undefined) ?? {}),
                    ...((body.p_details as JsonRecord | undefined) ?? {}),
                },
            };
            exposure = exposure
                ? this.update(exposure, values)
                : this.insertGeneric("seller_recovery_exposures", values);
            const active = this.tables.seller_recovery_exposures.filter(
                (row) => row.seller_cms_user_id === body.p_seller_cms_user_id,
            );
            const debt = active
                .filter((row) => row.status === "debt")
                .reduce((sum, row) => sum + Number(row.amount) - Number(row.recovered_amount), 0);
            const atRisk = active
                .filter((row) => row.status === "at_risk")
                .reduce((sum, row) => sum + Number(row.amount) - Number(row.recovered_amount), 0);
            this.update(account, {
                outstanding_debt_amount: debt,
                financial_exposure_amount: atRisk,
                risk_revision: Number(account.risk_revision ?? 0) + 1,
                risk_status: debt > 0 ? "blocked" : atRisk > 0 ? "restricted" : "standard",
                financial_hold_reason:
                    debt > 0
                        ? "Seller recovery debt blocks payments and payouts"
                        : atRisk > 0
                          ? "Seller recovery exposure blocks payments and payouts"
                          : null,
                payout_blocked_at:
                    debt > 0 || atRisk > 0 ? (account.payout_blocked_at ?? new Date().toISOString()) : null,
            });
            return jsonResponse({ account, exposure });
        }
        if (table === "rpc/claim_seller_payout_hold" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const account = this.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
            if (!account) {
                if (body.p_require_connected_account === true) {
                    return jsonResponse({ claimed: false, connectedAccountFound: false, account: null });
                }
                return jsonResponse({ message: "Stripe Connect account not found" }, 400);
            }
            if (body.p_require_connected_account === true && !account.stripe_account_id) {
                return jsonResponse({ claimed: false, connectedAccountFound: false, account: null });
            }
            const required = Number(account.outstanding_debt_amount) + Number(account.financial_exposure_amount);
            const claimed = (body.p_require_risk === false || required > 0) && !account.payout_hold_claimed_by;
            if (claimed) {
                this.update(account, {
                    payout_hold_claimed_by: body.p_owner,
                    payout_hold_claimed_at: new Date().toISOString(),
                });
            }
            return jsonResponse({ claimed, account });
        }
        if (table === "rpc/finalize_seller_payout_configuration" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const account = this.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
            if (!account) {
                return jsonResponse({ message: "Stripe Connect account not found" }, 400);
            }
            if (account.payout_hold_claimed_by !== body.p_owner) {
                return jsonResponse({ accepted: false, superseded: true, account });
            }
            const required = Number(account.outstanding_debt_amount) + Number(account.financial_exposure_amount);
            const superseded = Number(account.risk_revision) !== Number(body.p_expected_risk_revision) || required > 0;
            if (!superseded) {
                const clearsAmbiguousRecoveryHold =
                    body.p_clear_ambiguous_recovery_hold === true &&
                    account.risk_status === "manual_review" &&
                    account.financial_hold_reason === "Seller recovery payout hold is not confirmed" &&
                    required === 0;
                this.update(account, {
                    payout_schedule: body.p_interval,
                    risk_status: clearsAmbiguousRecoveryHold ? "standard" : account.risk_status,
                    financial_hold_reason: clearsAmbiguousRecoveryHold ? null : account.financial_hold_reason,
                    payout_blocked_at: clearsAmbiguousRecoveryHold ? null : account.payout_blocked_at,
                    last_provider_sync_at: new Date().toISOString(),
                    payout_hold_claimed_by: null,
                    payout_hold_claimed_at: null,
                    manual_payout_hold_started_at: null,
                    manual_payout_hold_alert_at: null,
                    manual_payout_hold_deadline_at: null,
                    manual_payout_hold_restore_settings: null,
                });
            }
            return jsonResponse({ accepted: true, superseded, account });
        }
        if (table === "rpc/cancel_seller_payout_configuration" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const account = this.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
            if (!account) {
                return jsonResponse({ message: "Stripe Connect account not found" }, 400);
            }
            if (account.payout_hold_claimed_by !== body.p_owner) {
                return jsonResponse({ accepted: false, superseded: true, account });
            }
            const required = Number(account.outstanding_debt_amount) + Number(account.financial_exposure_amount);
            const superseded = Number(account.risk_revision) !== Number(body.p_expected_risk_revision) || required > 0;
            this.update(account, {
                payout_hold_claimed_by: superseded ? body.p_owner : null,
                payout_hold_claimed_at: superseded ? new Date().toISOString() : null,
            });
            return jsonResponse({ accepted: true, superseded, account });
        }
        if (table === "rpc/complete_seller_payout_hold" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const account = this.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
            if (!account) {
                return jsonResponse({ message: "Stripe Connect account not found" }, 400);
            }
            if (account.payout_hold_claimed_by !== body.p_owner) {
                return jsonResponse({ accepted: false, needsReapply: false, account });
            }
            const required = Number(account.outstanding_debt_amount) + Number(account.financial_exposure_amount);
            const applied = Number(body.p_applied_minimum_amount);
            const needsReapply = body.p_succeeded === true && required > applied;
            const holdStartedAt = String(account.manual_payout_hold_started_at ?? new Date().toISOString());
            const holdStartedTime = Date.parse(holdStartedAt);
            this.update(
                account,
                body.p_succeeded === true
                    ? {
                          provider_hold_minimum_amount: Math.max(
                              Number(account.provider_hold_minimum_amount ?? 0),
                              applied,
                          ),
                          payout_schedule: "manual",
                          manual_payout_hold_started_at: holdStartedAt,
                          manual_payout_hold_alert_at:
                              account.manual_payout_hold_alert_at ??
                              new Date(holdStartedTime + 75 * 24 * 60 * 60 * 1000).toISOString(),
                          manual_payout_hold_deadline_at:
                              account.manual_payout_hold_deadline_at ??
                              new Date(holdStartedTime + 90 * 24 * 60 * 60 * 1000).toISOString(),
                          manual_payout_hold_restore_settings:
                              account.manual_payout_hold_restore_settings ?? body.p_restore_settings,
                          last_provider_sync_at: new Date().toISOString(),
                          payout_hold_claimed_by: needsReapply ? body.p_owner : null,
                          payout_hold_claimed_at: needsReapply ? new Date().toISOString() : null,
                      }
                    : {
                          risk_status: "manual_review",
                          financial_hold_reason: "Seller recovery payout hold is not confirmed",
                          payout_blocked_at: account.payout_blocked_at ?? new Date().toISOString(),
                          payout_hold_claimed_by: null,
                          payout_hold_claimed_at: null,
                      },
            );
            return jsonResponse({ accepted: true, needsReapply, account });
        }
        if (table === "rpc/reserve_account_financial_operation" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const businessKey = String(body.p_business_key);
            const existing = this.tables.financial_operations.find((row) => row.business_key === businessKey);
            if (existing) {
                if (JSON.stringify(existing.request) !== JSON.stringify(body.p_request)) {
                    return jsonResponse({ message: "conflict: account financial operation replay mismatch" }, 400);
                }
                return jsonResponse(existing);
            }
            const now = "2026-07-06T12:04:00.000Z";
            const operation = {
                id: this.nextRowId++,
                payment_id: null,
                business_key: businessKey,
                operation_type: body.p_operation_type,
                status: "reserved",
                stripe_object_id: null,
                request: body.p_request,
                response: null,
                last_error: null,
                attempt_count: 0,
                next_attempt_at: null,
                claimed_at: null,
                completed_at: null,
                created_at: now,
                updated_at: now,
            };
            this.tables.financial_operations.push(operation);
            return jsonResponse(operation);
        }
        if (table === "rpc/reserve_platform_financial_operation" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const businessKey = String(body.p_business_key);
            const existing = this.tables.financial_operations.find((row) => row.business_key === businessKey);
            if (existing) {
                return jsonResponse(existing);
            }
            const now = "2026-07-06T12:04:00.000Z";
            const operation = {
                id: this.nextRowId++,
                payment_id: null,
                business_key: businessKey,
                operation_type: body.p_operation_type,
                status: "reserved",
                stripe_object_id: null,
                request: body.p_request,
                response: null,
                last_error: null,
                attempt_count: 0,
                next_attempt_at: null,
                claimed_at: null,
                completed_at: null,
                created_at: now,
                updated_at: now,
            };
            this.tables.financial_operations.push(operation);
            return jsonResponse(operation);
        }
        if (table === "rpc/claim_platform_payout_protection" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const control = this.tables.platform_payout_controls[0]!;
            const required = Number(body.p_required_minimum_amount);
            const revision = Number(body.p_liability_revision);
            if (revision < Number(control.liability_revision)) {
                return jsonResponse({ message: "conflict: stale Commerce platform payout liability revision" }, 400);
            }
            if (
                revision === Number(control.liability_revision) &&
                required !== Number(control.required_minimum_amount)
            ) {
                return jsonResponse({ message: "conflict: Commerce revision changed amount" }, 400);
            }
            if (revision > Number(control.liability_revision)) {
                this.update(control, {
                    required_minimum_amount: required,
                    liability_revision: revision,
                    decrease_authorization_id:
                        required < Number(control.provider_minimum_amount) ? body.p_decrease_authorization_id : null,
                });
            } else if (required < Number(control.provider_minimum_amount)) {
                if (!control.decrease_authorization_id && body.p_decrease_authorization_id) {
                    this.update(control, {
                        decrease_authorization_id: body.p_decrease_authorization_id,
                    });
                } else if (control.decrease_authorization_id !== body.p_decrease_authorization_id) {
                    return jsonResponse({ message: "forbidden: Admin decrease authorization mismatch" }, 400);
                }
            }
            const claimed = !control.claim_owner || control.claim_owner === body.p_owner;
            if (claimed) {
                this.update(control, {
                    claim_owner: body.p_owner,
                    claimed_at: new Date().toISOString(),
                });
            }
            return jsonResponse({ claimed, control });
        }
        if (table === "rpc/complete_platform_payout_protection" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const control = this.tables.platform_payout_controls[0]!;
            if (control.claim_owner !== body.p_owner) {
                return jsonResponse({ accepted: false, needsReapply: false, control });
            }
            const applied = Number(body.p_applied_minimum_amount);
            const needsReapply =
                body.p_succeeded === true &&
                (applied < Number(control.required_minimum_amount) ||
                    (control.decrease_authorization_id !== null &&
                        applied !== Number(control.required_minimum_amount)));
            this.update(
                control,
                body.p_succeeded === true
                    ? {
                          provider_minimum_amount: applied,
                          decrease_authorization_id: needsReapply ? control.decrease_authorization_id : null,
                          claim_owner: needsReapply ? body.p_owner : null,
                          claimed_at: needsReapply ? new Date().toISOString() : null,
                          last_error: null,
                          last_provider_sync_at: new Date().toISOString(),
                      }
                    : {
                          claim_owner: null,
                          claimed_at: null,
                          last_error: body.p_error,
                      },
            );
            return jsonResponse({
                accepted: true,
                needsReapply,
                revisionChanged: Number(control.liability_revision) !== Number(body.p_expected_liability_revision),
                control,
            });
        }
        if (table === "rpc/mark_payment_manual_review" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const payment = this.tables.payments.find((row) => same(row.id, body.p_payment_id));
            if (payment) {
                Object.assign(payment, { settlement_status: "manual_review", manual_review_reason: body.p_reason });
            }
            return jsonResponse(payment ?? {});
        }
        if (table === "rpc/apply_dispute_funds_truth" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const dispute = this.tables.stripe_disputes.find(
                (row) => row.stripe_dispute_id === body.p_stripe_dispute_id,
            );
            if (!dispute) {
                return jsonResponse({ message: "not_found: Stripe dispute" }, 400);
            }
            const previousAt = Date.parse(String(dispute.last_funds_event_at ?? ""));
            const nextAt = Date.parse(String(body.p_event_at));
            if (!Number.isFinite(previousAt) || nextAt > previousAt) {
                this.update(dispute, {
                    funds_withdrawn: body.p_funds_withdrawn,
                    last_funds_event_at: body.p_event_at,
                    last_funds_event_id: body.p_event_id,
                });
            } else if (nextAt === previousAt && dispute.funds_withdrawn !== body.p_funds_withdrawn) {
                this.update(dispute, {
                    funds_withdrawn: true,
                    last_funds_event_id: "same-second-conflict",
                });
            }
            return jsonResponse(dispute);
        }
        if (table === "rpc/read_stripe_dispute_application_context" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const payment = this.tables.payments.find((row) => row.stripe_charge_id === body.p_stripe_charge_id);
            const dispute = payment
                ? this.tables.stripe_disputes.find((row) => row.stripe_dispute_id === body.p_stripe_dispute_id)
                : undefined;
            return jsonResponse({ payment: payment ?? null, dispute: dispute ?? null });
        }
        if (table === "rpc/authorize_irreversible_dispute_action" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            if (body.p_actor_kind !== "admin") {
                return jsonResponse({ message: "forbidden: admin approval actor is required" }, 400);
            }
            const dispute = this.tables.stripe_disputes.find((row) => same(row.id, body.p_dispute_id));
            const payment = dispute ? this.tables.payments.find((row) => same(row.id, dispute.payment_id)) : undefined;
            if (!payment) {
                return jsonResponse({ message: "not_found: payment not found" }, 400);
            }
            const thresholdAmount = Number(payment.dual_approval_threshold_amount);
            if (Number(body.p_amount) < thresholdAmount) {
                return jsonResponse({
                    approved: true,
                    dualApprovalRequired: false,
                    approvalStatus: "not_required",
                    firstApprovedBy: body.p_actor_id,
                });
            }
            const actionKey = String(body.p_action_key);
            let approval = this.tables.irreversible_dispute_action_approvals.find(
                (row) => row.action_key === actionKey,
            );
            if (!approval) {
                approval = this.insertGeneric("irreversible_dispute_action_approvals", {
                    action_key: actionKey,
                    action_type: body.p_action_type,
                    dispute_id: body.p_dispute_id,
                    amount: body.p_amount,
                    threshold_amount: thresholdAmount,
                    payload_sha256: body.p_payload_sha256,
                    status: "pending_second_approval",
                    first_actor_kind: body.p_actor_kind,
                    first_actor_id: body.p_actor_id,
                    second_actor_kind: null,
                    second_actor_id: null,
                });
            } else if (
                approval.action_type !== body.p_action_type ||
                !same(approval.dispute_id, body.p_dispute_id) ||
                !same(approval.amount, body.p_amount) ||
                !same(approval.threshold_amount, thresholdAmount) ||
                approval.payload_sha256 !== body.p_payload_sha256
            ) {
                return jsonResponse({ message: "conflict: irreversible dispute approval replay mismatch" }, 400);
            } else if (approval.status !== "approved" && approval.first_actor_id !== body.p_actor_id) {
                this.update(approval, {
                    status: "approved",
                    second_actor_kind: body.p_actor_kind,
                    second_actor_id: body.p_actor_id,
                });
            }
            return jsonResponse({
                ...approval,
                approved: approval.status === "approved",
                dualApprovalRequired: true,
                approvalStatus: approval.status,
                firstApprovedBy: approval.first_actor_id,
                secondApprovedBy: approval.second_actor_id,
            });
        }
        if (table === "rpc/claim_stripe_events" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const limit = Number(body.p_limit ?? 50);
            const claimed = this.tables.stripe_events
                .filter(
                    (row) =>
                        ["pending", "failed"].includes(String(row.processing_status ?? "pending")) ||
                        (row.processing_status === "processing" &&
                            Date.parse(String(row.processing_started_at ?? "")) <= Date.now() - 5 * 60_000),
                )
                .slice(0, limit)
                .map((row) =>
                    this.update(row, {
                        processing_status: "processing",
                        processing_started_at: new Date().toISOString(),
                        attempt_count: Number(row.attempt_count ?? 0) + 1,
                        last_error: null,
                    }),
                );
            return jsonResponse(claimed);
        }
        if (table === "rpc/claim_financial_operations" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const limit = Number(body.p_limit ?? 50);
            const claimed = this.tables.financial_operations
                .filter(
                    (row) =>
                        [
                            "payment_intent_create",
                            "payment_intent_cancel",
                            "transfer_create",
                            "transfer_reversal_create",
                            "refund_create",
                            "payout_schedule_update",
                        ].includes(String(row.operation_type)) &&
                        ["reserved", "processing", "failed"].includes(String(row.status)),
                )
                .slice(0, limit)
                .map((row) =>
                    this.update(row, {
                        status: "processing",
                        claimed_at: new Date().toISOString(),
                        attempt_count: Number(row.attempt_count ?? 0) + 1,
                        last_error: null,
                    }),
                );
            return jsonResponse(claimed);
        }
        if (table === "rpc/enqueue_commerce_provider_projection" && method === "POST") {
            if (this.failPaymentProjectionEnqueue) {
                this.failPaymentProjectionEnqueue = false;
                return jsonResponse({ message: "simulated payment projection enqueue failure" }, 500);
            }
            const body = JSON.parse(await request.text()) as JsonRecord;
            let projection = this.tables.commerce_projection_outbox.find(
                (row) => row.projection_key === body.p_projection_key,
            );
            if (!projection) {
                projection = this.insertGeneric("commerce_projection_outbox", {
                    operation_id: null,
                    payment_id: body.p_payment_id,
                    projection_key: body.p_projection_key,
                    projection_kind: body.p_projection_kind,
                    provider_object_id: body.p_provider_object_id,
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
            if (this.losePaymentProjectionEnqueueResponse) {
                this.losePaymentProjectionEnqueueResponse = false;
                throw new Error("simulated lost payment projection response");
            }
            return jsonResponse(projection);
        }
        if (table === "rpc/enqueue_commerce_refund_projection" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const refund = this.tables.refunds.find((row) => same(row.id, body.p_refund_id));
            if (!refund) {
                return jsonResponse({ message: "not_found: refund" }, 400);
            }
            const projectionKey = `refund:${refund.id}:${refund.status}`;
            let projection = this.tables.commerce_projection_outbox.find((row) => row.projection_key === projectionKey);
            if (!projection) {
                projection = this.insertGeneric("commerce_projection_outbox", {
                    operation_id: refund.operation_id,
                    payment_id: refund.payment_id,
                    projection_key: projectionKey,
                    projection_kind: "refund",
                    provider_object_id: refund.stripe_refund_id ?? String(refund.id),
                    projection_payload: {
                        refundId: refund.id,
                        refundRequestId: refund.refund_request_id,
                        commerceRefundRequestId: refund.commerce_refund_request_id,
                        stripeRefundId: refund.stripe_refund_id,
                        status: refund.status,
                        failureReason: refund.failure_reason,
                        providerSnapshot: refund.provider_snapshot ?? {},
                        occurredAt: refund.updated_at,
                    },
                    recovery_key:
                        Number(refund.required_reversal_amount) > 0
                            ? `${refund.refund_request_id}:seller-recovery`
                            : null,
                    causal_sequence: refund.status === "pending" ? 10 : 20,
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
            return jsonResponse(projection);
        }
        if (table === "rpc/read_reconciliation_operations" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const limit = Number(body.p_limit ?? 50);
            const operations = [...this.tables.financial_operations]
                .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))
                .slice(0, limit);
            return jsonResponse(
                operations.map((operation) => {
                    const payment = this.tables.payments.find((row) => same(row.id, operation.payment_id));
                    return {
                        operation,
                        client_reference_id: payment?.client_reference_id ?? null,
                        payment_currency: payment?.currency ?? null,
                    };
                }),
            );
        }
        if (table === "rpc/claim_commerce_projection_outbox" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            return jsonResponse(this.claimCommerceProjectionOutbox(body));
        }
        if (table === "rpc/claim_reconciliation_projection_batch" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const claimed = this.claimCommerceProjectionOutbox(body);
            return jsonResponse(
                claimed.map((projection) => {
                    const payment = this.tables.payments.find((row) => same(row.id, projection.payment_id)) ?? null;
                    const operation =
                        this.tables.financial_operations.find((row) => same(row.id, projection.operation_id)) ?? null;
                    const operationPayment = operation
                        ? (this.tables.payments.find((row) => same(row.id, operation.payment_id)) ?? null)
                        : null;
                    const providerObjectId = String(projection.provider_object_id ?? "");
                    const dispute =
                        projection.projection_kind === "dispute" && /^[1-9][0-9]*$/.test(providerObjectId)
                            ? (this.tables.stripe_disputes.find((row) => same(row.id, providerObjectId)) ?? null)
                            : null;
                    const disputePayment = dispute
                        ? (this.tables.payments.find((row) => same(row.id, dispute.payment_id)) ?? null)
                        : null;
                    const evidence = dispute
                        ? this.tables.stripe_dispute_evidence
                              .filter((row) => same(row.dispute_id, dispute.id))
                              .sort((left, right) => String(right.staged_at).localeCompare(String(left.staged_at)))
                        : [];
                    const pendingApproval = dispute
                        ? (this.tables.irreversible_dispute_action_approvals
                              .filter(
                                  (row) => same(row.dispute_id, dispute.id) && row.status === "pending_second_approval",
                              )
                              .sort((left, right) =>
                                  String(right.created_at).localeCompare(String(left.created_at)),
                              )[0] ?? null)
                        : null;
                    const staged = evidence[0];
                    return {
                        projection,
                        payment,
                        financial_operation: operation,
                        operation_payment: operationPayment,
                        dispute,
                        dispute_client_reference_id: disputePayment?.client_reference_id ?? null,
                        staged_evidence: staged
                            ? {
                                  evidence_operation_id: staged.evidence_operation_id,
                                  staged_at: staged.staged_at,
                                  submitted_at: staged.submitted_at,
                              }
                            : null,
                        evidence_submission_count: evidence.filter((row) => row.submitted_at).length,
                        pending_approval: pendingApproval
                            ? {
                                  action_type: pendingApproval.action_type,
                                  status: pendingApproval.status,
                                  first_actor_id: pendingApproval.first_actor_id,
                                  first_approved_at: pendingApproval.first_approved_at,
                                  second_actor_id: pendingApproval.second_actor_id,
                                  second_approved_at: pendingApproval.second_approved_at,
                              }
                            : null,
                    };
                }),
            );
        }
        if (table === "rpc/read_payment_reconciliation_ledger" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const paymentId = Number(body.p_payment_id);
            const succeededRefunds = this.tables.refunds.filter(
                (row) => same(row.payment_id, paymentId) && row.status === "succeeded",
            );
            return jsonResponse([
                {
                    refunded_amount: succeededRefunds.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
                    transferred_amount: this.tables.transfers
                        .filter(
                            (row) =>
                                same(row.payment_id, paymentId) &&
                                ["succeeded", "partially_reversed", "reversed"].includes(String(row.status)),
                        )
                        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
                    reversed_amount: this.tables.transfer_reversals
                        .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
                        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
                    seller_recovery_amount: succeededRefunds.reduce(
                        (sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0),
                        0,
                    ),
                },
            ]);
        }
        if (table === "rpc/read_refund_preflight_context" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const paymentId = Number(body.p_payment_id);
            const refundRequestId = String(body.p_refund_request_id);
            await this.waitForPostgrestRead("refunds");
            const existing = this.tables.refunds.find((row) => row.refund_request_id === refundRequestId);
            if (existing) {
                return jsonResponse([
                    {
                        existing_refund: { ...existing },
                        has_nonterminal: false,
                        committed_reduction_amount: 0,
                    },
                ]);
            }
            await this.waitForPostgrestRead("refunds");
            const refunds = this.tables.refunds.filter((row) => same(row.payment_id, paymentId));
            return jsonResponse([
                {
                    existing_refund: null,
                    has_nonterminal: refunds.some((row) =>
                        ["reserved", "processing", "pending", "manual_review"].includes(String(row.status)),
                    ),
                    committed_reduction_amount: refunds
                        .filter((row) => row.status === "succeeded")
                        .reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0),
                },
            ]);
        }
        if (table === "rpc/read_refund_projection_context" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const paymentId = Number(body.p_payment_id);
            await this.waitForPostgrestRead("refunds");
            const succeededAtAmount = this.tables.refunds.filter(
                (row) => same(row.payment_id, paymentId) && row.status === "succeeded",
            );
            const refundedAmount = succeededAtAmount.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
            await this.waitForPostgrestRead("refunds");
            const refundFeeAmount = this.tables.refunds
                .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
                .reduce((sum, row) => sum + Number(row.actual_stripe_fee_amount ?? 0), 0);
            await this.waitForPostgrestRead("payments");
            const paymentRow = this.tables.payments.find((row) => same(row.id, paymentId));
            const payment = paymentRow ? { ...paymentRow } : null;
            let sellerRecoveryAmount = 0;
            if (payment) {
                await this.waitForPostgrestRead("refunds");
                sellerRecoveryAmount = this.tables.refunds
                    .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
                    .reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0);
            }
            return jsonResponse([
                {
                    refunded_amount: refundedAmount,
                    actual_stripe_refund_fee_amount: refundFeeAmount,
                    payment,
                    seller_recovery_amount: sellerRecoveryAmount,
                },
            ]);
        }
        if (table === "rpc/read_transfer_reversal_completion_context" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const paymentId = Number(body.p_payment_id);
            await this.waitForPostgrestRead("transfer_reversals");
            const reversedAmount = this.tables.transfer_reversals
                .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
                .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
            await this.waitForPostgrestRead("payments");
            let payment = this.tables.payments.find((row) => same(row.id, paymentId));
            if (this.omitNextPaymentReadResult) {
                this.omitNextPaymentReadResult = false;
                payment = undefined;
            }
            return jsonResponse([
                {
                    reversed_amount: reversedAmount,
                    payment: payment ? { ...payment } : null,
                },
            ]);
        }
        if (table === "rpc/read_settlement_release_context" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const paymentId = Number(body.p_payment_id);
            await this.waitForPostgrestRead("accounts");
            const seller = this.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
            await this.waitForPostgrestRead("transfers");
            const transfer = this.tables.transfers.find(
                (row) => row.release_authorization_id === body.p_release_authorization_id,
            );
            await this.waitForPostgrestRead("refunds");
            const sellerRecoveryAmount = this.tables.refunds
                .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
                .reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0);
            return jsonResponse([
                {
                    seller_account: seller ? { ...seller } : null,
                    existing_transfer: transfer ? { ...transfer } : null,
                    seller_recovery_amount: sellerRecoveryAmount,
                },
            ]);
        }
        if (table === "rpc/read_settlement_release_ledger" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const paymentId = Number(body.p_payment_id);
            await this.waitForPostgrestRead("transfers");
            const transferredAmount = this.tables.transfers
                .filter(
                    (row) =>
                        same(row.payment_id, paymentId) &&
                        ["succeeded", "partially_reversed", "reversed"].includes(String(row.status)),
                )
                .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
            await this.waitForPostgrestRead("transfer_reversals");
            const reversedAmount = this.tables.transfer_reversals
                .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
                .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
            await this.waitForPostgrestRead("refunds");
            const sellerRecoveryAmount = this.tables.refunds
                .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
                .reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0);
            return jsonResponse([
                {
                    transferred_amount: transferredAmount,
                    reversed_amount: reversedAmount,
                    seller_recovery_amount: sellerRecoveryAmount,
                },
            ]);
        }
        if (table === "rpc/read_payment_reconciliation_local_context" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const paymentId = Number(body.p_payment_id);
            const payment = this.tables.payments.find((row) => same(row.id, paymentId));
            const refunds = this.tables.refunds
                .filter((row) => same(row.payment_id, paymentId))
                .sort((left, right) => Number(left.id) - Number(right.id))
                .map((row) => ({ ...row }));
            return jsonResponse([
                {
                    payment: payment ? { ...payment } : null,
                    refunds,
                },
            ]);
        }
        if (table === "rpc/read_provider_transfer_reconciliation_context" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const transfer = this.tables.transfers.find((row) => row.stripe_transfer_id === body.p_stripe_transfer_id);
            const localReversedAmount = transfer
                ? this.tables.transfer_reversals
                      .filter((row) => same(row.transfer_id, transfer.id) && row.status === "succeeded")
                      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
                : 0;
            return jsonResponse([
                {
                    transfer: transfer ? { ...transfer } : null,
                    local_reversed_amount: localReversedAmount,
                },
            ]);
        }
        if (table === "rpc/read_financial_operation_recovery_context" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const copy = (row: JsonRecord | undefined): JsonRecord | null => (row ? { ...row } : null);
            return jsonResponse([
                {
                    payment: copy(this.tables.payments.find((row) => same(row.id, body.p_payment_id))),
                    transfer: copy(this.tables.transfers.find((row) => same(row.operation_id, body.p_operation_id))),
                    transfer_reversal: copy(
                        this.tables.transfer_reversals.find((row) => same(row.operation_id, body.p_operation_id)),
                    ),
                    transfer_recovery: copy(
                        this.tables.transfer_recovery_requests.find(
                            (row) => row.recovery_request_id === body.p_recovery_request_id,
                        ),
                    ),
                    refund: copy(this.tables.refunds.find((row) => same(row.operation_id, body.p_operation_id))),
                },
            ]);
        }
        if (table === "rpc/ack_commerce_projection_outbox" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const row = this.tables.commerce_projection_outbox.find(
                (candidate) =>
                    same(candidate.id, body.p_projection_id) &&
                    candidate.claim_token === body.p_claim_token &&
                    candidate.projection_status === "leased",
            );
            if (!row) {
                return jsonResponse({ message: "conflict: projection lease is no longer valid" }, 400);
            }
            const acknowledged = this.update(row, {
                projection_status: "succeeded",
                projected_at: new Date().toISOString(),
                claim_owner: null,
                claim_token: null,
                claimed_at: null,
                next_attempt_at: null,
                last_error: null,
            });
            const exception = this.tables.provider_exceptions.find(
                (candidate) => candidate.deduplication_key === `commerce-projection:${row.id}`,
            );
            if (exception) {
                this.update(exception, {
                    status: "resolved",
                    resolved_at: new Date().toISOString(),
                    resolved_by: "commerce-projection-ack",
                });
            }
            return jsonResponse(acknowledged);
        }
        if (table === "rpc/fail_commerce_projection_outbox" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const row = this.tables.commerce_projection_outbox.find(
                (candidate) =>
                    same(candidate.id, body.p_projection_id) &&
                    candidate.claim_token === body.p_claim_token &&
                    candidate.projection_status === "leased",
            );
            if (!row) {
                return jsonResponse({ message: "conflict: projection lease is no longer valid" }, 400);
            }
            const failed = this.update(row, {
                projection_status: Number(row.attempt_count) >= 5 ? "manual_review" : "retry",
                next_attempt_at: Number(row.attempt_count) >= 5 ? null : new Date(Date.now() + 60_000).toISOString(),
                claim_owner: null,
                claim_token: null,
                claimed_at: null,
                last_error: body.p_error,
            });
            if (failed.projection_status === "manual_review") {
                const values = {
                    deduplication_key: `commerce-projection:${row.id}`,
                    payment_id: row.payment_id,
                    operation_id: row.operation_id,
                    exception_type: "commerce_projection_delivery_failed",
                    severity: "critical",
                    status: "open",
                    message: "Commerce projection exhausted automatic delivery retries",
                    details: {
                        projectionId: row.id,
                        projectionKey: row.projection_key,
                        projectionKind: row.projection_kind,
                        attemptCount: row.attempt_count,
                        interventionRevision: row.intervention_revision ?? 0,
                        lastError: row.last_error,
                    },
                };
                const existing = this.tables.provider_exceptions.find(
                    (candidate) => candidate.deduplication_key === values.deduplication_key,
                );
                if (existing) {
                    this.update(existing, values);
                } else {
                    this.insertGeneric("provider_exceptions", values);
                }
            }
            return jsonResponse(failed);
        }
        if (table === "rpc/requeue_commerce_projection_outbox" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const row = this.tables.commerce_projection_outbox.find((candidate) =>
                same(candidate.id, body.p_projection_id),
            );
            if (!row) {
                return jsonResponse({ message: "not_found: Commerce projection" }, 400);
            }
            if (Number(row.intervention_revision ?? 0) !== Number(body.p_expected_intervention_revision)) {
                return jsonResponse({ message: "conflict: stale Commerce projection intervention revision" }, 400);
            }
            if (row.projection_status !== "manual_review") {
                return jsonResponse(
                    { message: "conflict: Commerce projection is not awaiting Finance intervention" },
                    400,
                );
            }
            const revision = Number(row.intervention_revision ?? 0) + 1;
            const requeued = this.update(row, {
                projection_status: "retry",
                attempt_count: 0,
                next_attempt_at: new Date().toISOString(),
                claim_owner: null,
                claim_token: null,
                claimed_at: null,
                intervention_revision: revision,
                last_intervention_at: new Date().toISOString(),
                last_intervention_by: body.p_actor_id,
                last_intervention_reason: body.p_reason,
            });
            this.insertGeneric("commerce_projection_interventions", {
                projection_id: row.id,
                intervention_revision: revision,
                action: "requeue",
                actor_id: body.p_actor_id,
                reason: body.p_reason,
                previous_status: "manual_review",
                next_status: "retry",
            });
            return jsonResponse(requeued);
        }
        if (!this.tables[table]) {
            throw new Error(`unexpected table: ${table}`);
        }
        if (method === "GET") {
            await this.waitForPostgrestRead(table);
            if (table === "accounts" && this.omitNextAccountRead) {
                this.omitNextAccountRead = false;
                return jsonResponse([]);
            }
            if (table === "payments" && this.omitNextPaymentReadResult) {
                this.omitNextPaymentReadResult = false;
                return jsonResponse([]);
            }
            if (table === "refunds" && url.searchParams.has("id") && this.nextRefundReloadPause) {
                const pause = this.nextRefundReloadPause;
                this.nextRefundReloadPause = null;
                pause.entered();
                await pause.wait;
            }
            return jsonResponse(this.select(table, url));
        }
        if (method === "POST") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            let inserted: JsonRecord;
            if (table === "accounts") {
                inserted = this.upsertAccount(row);
            } else if (table === "payments") {
                inserted = this.insertPayment(row);
            } else {
                const conflict = url.searchParams.get("on_conflict");
                const conflictFields = conflict?.split(",") ?? [];
                const existing = conflictFields.length
                    ? this.tables[table].find((candidate) =>
                          conflictFields.every((field) => same(candidate[field], row[field])),
                      )
                    : null;
                if (existing && request.headers.get("prefer")?.includes("ignore-duplicates")) {
                    return jsonResponse([], 200);
                }
                inserted = existing ? this.update(existing, row) : this.insertGeneric(table, row);
            }
            return jsonResponse([inserted], 201);
        }
        if (method === "PATCH") {
            const patch = JSON.parse(await request.text()) as JsonRecord;
            if (
                table === "financial_operations" &&
                patch.status === "failed" &&
                this.failFinancialOperationFailureUpdate
            ) {
                this.failFinancialOperationFailureUpdate = false;
                return jsonResponse({ message: "simulated financial operation failure update" }, 500);
            }
            const rows = this.selectRefs(table, url).map((row) => this.update(row, patch));
            if (table === "financial_operations") {
                for (const row of rows) {
                    this.enqueueCommerceProjection(row);
                }
            }
            return jsonResponse(rows);
        }
        throw new Error(`unexpected method: ${method} ${request.url}`);
    }

    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map((row) => ({ ...row }));
    }

    seedDashboardPayment(clientReferenceId: string, patch: JsonRecord = {}): number {
        const payment = this.insertPayment({
            client_reference_id: clientReferenceId,
            financial_terms_hash: financialTermsHash,
            financial_revision: 1,
            dual_approval_threshold_amount: 1000,
            buyer_cms_user_id: `buyer-${clientReferenceId}`,
            seller_cms_user_id: `seller-${clientReferenceId}`,
            seller_stripe_account_id: `acct_${clientReferenceId}`,
            stripe_payment_intent_id: `pi_${clientReferenceId}`,
            transfer_group: `group_${clientReferenceId}`,
            currency: "eur",
            amount_total: 1200,
            seller_transfer_amount: 1080,
            platform_retained_amount: 120,
            payment_status: "succeeded",
            settlement_status: "held",
            description: null,
            ...patch,
        });
        return Number(payment.id);
    }

    seedDashboardRow(table: DashboardTable, row: JsonRecord): JsonRecord {
        return this.insertGeneric(table, row);
    }

    patchDashboardRow(table: DashboardTable, id: number, patch: JsonRecord): void {
        const row = this.tables[table]?.find((candidate) => same(candidate.id, id));
        if (!row) {
            throw new Error(`unknown ${table} dashboard row ${id}`);
        }
        this.update(row, patch);
    }

    clearPostgrestRequests(): void {
        this.postgrestRequests.length = 0;
    }

    clearStripeRequests(): void {
        this.stripeRequests.length = 0;
    }

    clearExternalRequestOrder(): void {
        this.externalRequestOrder.length = 0;
    }

    failNextAccountReloadAfterTermsAcceptance(): void {
        this.failAccountReloadAfterTermsAcceptance = true;
    }

    private dashboardPage(
        table: DashboardTable,
        body: JsonRecord,
        searchFields: string[],
        idField?: string,
    ): JsonRecord[] {
        let rows = this.tables[table]!;
        if (idField && typeof body.p_dispute_id === "string") {
            rows = rows.filter((row) => same(row[idField], body.p_dispute_id));
        } else {
            if (typeof body.p_status === "string") {
                rows = rows.filter((row) => row.status === body.p_status);
            }
            if (typeof body.p_search === "string") {
                const pattern = new RegExp(
                    body.p_search
                        .split("*")
                        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                        .join(".*"),
                    "i",
                );
                rows = rows.filter((row) => searchFields.some((field) => pattern.test(String(row[field] ?? ""))));
            }
        }
        const limit = Number(body.p_limit);
        return rows
            .slice(0, Number.isSafeInteger(limit) && limit >= 0 ? limit : rows.length)
            .map((row) => ({ ...row }));
    }

    private requiredDashboardPayment(paymentId: unknown): JsonRecord {
        const payment = this.tables.payments.find((row) => same(row.id, paymentId));
        if (!payment) {
            throw new Error(`unknown dashboard payment ${String(paymentId)}`);
        }
        return payment;
    }

    private select(table: string, url: URL): JsonRecord[] {
        return this.selectRefs(table, url).map((row) => ({ ...row }));
    }

    private selectRefs(table: string, url: URL): JsonRecord[] {
        let rows = this.tables[table]!;
        for (const [key, value] of url.searchParams.entries()) {
            const filter = filterValue(value);
            if (!filter) {
                continue;
            }
            if (["select", "order", "limit", "on_conflict"].includes(key)) {
                continue;
            }
            if (filter.operator === "not" && filter.value === "is.null") {
                rows = rows.filter((row) => row[key] !== null && row[key] !== undefined);
                continue;
            }
            if (filter.operator === "neq") {
                rows = rows.filter((row) => !same(row[key], filter.value));
                continue;
            }
            if (filter.operator === "in") {
                const values = filter.value.replace(/^\(|\)$/g, "").split(",");
                rows = rows.filter((row) => values.some((value) => same(row[key], value)));
                continue;
            }
            if (filter.operator !== "eq") {
                continue;
            }
            rows = rows.filter((row) => same(row[key], filter.value));
        }
        const or = url.searchParams.get("or");
        if (or) {
            if (or.includes("outstanding_debt_amount.gt.0") || or.includes("financial_exposure_amount.gt.0")) {
                rows = rows.filter(
                    (row) =>
                        Number(row.outstanding_debt_amount ?? 0) > 0 || Number(row.financial_exposure_amount ?? 0) > 0,
                );
            } else {
                const search = or.match(/ilike\.\*([^*]+)\*/)?.[1]?.toLowerCase() ?? "";
                const fields =
                    table === "accounts"
                        ? ["cms_user_id", "stripe_account_id"]
                        : [
                              "client_reference_id",
                              "buyer_cms_user_id",
                              "seller_cms_user_id",
                              "stripe_payment_intent_id",
                          ];
                rows = rows.filter((row) =>
                    fields.some((key) =>
                        String(row[key] ?? "")
                            .toLowerCase()
                            .includes(search),
                    ),
                );
            }
        }
        const limit = Number(url.searchParams.get("limit") ?? rows.length);
        return rows.slice(0, Number.isSafeInteger(limit) && limit >= 0 ? limit : rows.length);
    }

    private claimCommerceProjectionOutbox(body: JsonRecord): JsonRecord[] {
        const limit = Number(body.p_limit ?? 50);
        return this.tables.commerce_projection_outbox
            .filter(
                (row) =>
                    (["pending", "retry"].includes(String(row.projection_status)) &&
                        (!row.next_attempt_at || Date.parse(String(row.next_attempt_at)) <= Date.now())) ||
                    (row.projection_status === "leased" &&
                        Date.parse(String(row.claimed_at ?? "")) <= Date.now() - 5 * 60_000),
            )
            .filter(
                (row) =>
                    !(
                        row.projection_kind === "refund" &&
                        row.recovery_key &&
                        this.tables.commerce_projection_outbox.some(
                            (predecessor) =>
                                predecessor.recovery_key === row.recovery_key &&
                                predecessor.projection_kind === "reversal" &&
                                Number(predecessor.causal_sequence) < Number(row.causal_sequence) &&
                                predecessor.projection_status !== "succeeded",
                        )
                    ),
            )
            .filter(
                (row) =>
                    !(
                        row.projection_kind === "refund" &&
                        this.tables.commerce_projection_outbox.some(
                            (predecessor) =>
                                same(predecessor.operation_id, row.operation_id) &&
                                predecessor.projection_kind === "refund" &&
                                Number(predecessor.causal_sequence) < Number(row.causal_sequence) &&
                                predecessor.projection_status !== "succeeded",
                        )
                    ),
            )
            .sort(
                (left, right) =>
                    String(left.created_at).localeCompare(String(right.created_at)) ||
                    Number(left.causal_sequence) - Number(right.causal_sequence) ||
                    Number(left.id) - Number(right.id),
            )
            .slice(0, limit)
            .map((row) =>
                this.update(row, {
                    projection_status: "leased",
                    claim_owner: body.p_owner,
                    claim_token: `claim-${row.id}-${Number(row.attempt_count ?? 0) + 1}`,
                    claimed_at: new Date().toISOString(),
                    attempt_count: Number(row.attempt_count ?? 0) + 1,
                    last_error: null,
                }),
            );
    }

    private upsertAccount(value: JsonRecord): JsonRecord {
        const now = "2026-07-06T12:00:00.000Z";
        const index = this.tables.accounts.findIndex((row) => same(row.cms_user_id, value.cms_user_id));
        const next = {
            ...(index >= 0 ? this.tables.accounts[index] : defaultAccountRow(String(value.cms_user_id), now)),
            ...value,
            updated_at: now,
        };
        if (index >= 0) {
            this.tables.accounts[index] = next;
        } else {
            this.tables.accounts.push(next);
        }
        return { ...next };
    }

    private insertPayment(value: JsonRecord): JsonRecord {
        const now = "2026-07-06T12:05:00.000Z";
        const row = {
            id: this.nextPaymentId++,
            stripe_payment_intent_id: null,
            stripe_charge_id: null,
            stripe_charge_balance_transaction_id: null,
            last_stripe_event_id: null,
            refunded_amount: 0,
            transferred_amount: 0,
            reversed_amount: 0,
            actual_stripe_charge_fee_amount: 0,
            actual_stripe_refund_fee_amount: 0,
            actual_stripe_processing_fee_amount: 0,
            actual_stripe_charge_net_amount: null,
            actual_stripe_fee_currency: null,
            actual_stripe_charge_fee_details: [],
            dispute_status: "none",
            manual_review_reason: null,
            paid_at: null,
            cancelled_at: null,
            last_provider_sync_at: null,
            created_at: now,
            updated_at: now,
            ...value,
        };
        this.tables.payments.push(row);
        return { ...row };
    }

    private seedPaymentIntent(payment: JsonRecord): JsonRecord {
        const id = `pi_${this.nextIntentId++}`;
        const intent = {
            id,
            client_secret: `${id}_secret`,
            status: "requires_payment_method",
            amount: payment.amount_total,
            amount_received: 0,
            currency: payment.currency,
            transfer_group: payment.transfer_group,
            metadata: {
                cms_payment_id: String(payment.id),
                client_reference_id: payment.client_reference_id,
                financial_terms_hash: payment.financial_terms_hash,
                seller_cms_user_id: payment.seller_cms_user_id,
            },
            latest_charge: null,
        };
        this.paymentIntents.set(id, intent);
        return intent;
    }

    applyNextTransferReversalScenario(
        allocations: Array<{
            operation: JsonRecord | undefined;
            reversal: JsonRecord;
            transfer: JsonRecord | undefined;
        }>,
    ): void {
        const scenario = this.nextTransferReversalScenario;
        if (!scenario) {
            return;
        }
        this.nextTransferReversalScenario = null;
        const allocation = allocations[0];
        if (!allocation?.operation || !allocation.transfer) {
            throw new Error("transfer reversal scenario has no allocation");
        }
        const operation = allocation.operation;
        const transferId = String(allocation.transfer.stripe_transfer_id);
        const providerReversal = {
            id: scenario === "operation-succeeded" ? "trr_operation_succeeded" : "trr_metadata_recovered",
            amount: allocation.reversal.amount,
            currency: allocation.reversal.currency,
            metadata: { operation_key: operation.business_key },
        };
        if (scenario === "operation-succeeded") {
            this.update(operation, {
                status: "succeeded",
                stripe_object_id: providerReversal.id,
                attempt_count: 1,
            });
            this.providerTransferReversals.set(transferId, [providerReversal]);
            return;
        }
        this.update(operation, {
            status: scenario === "manual-review-no-match" ? "manual_review" : "processing",
            attempt_count: 1,
        });
        if (scenario === "metadata-match") {
            this.providerTransferReversals.set(transferId, [providerReversal]);
        }
        if (scenario === "ambiguous") {
            this.providerTransferReversals.set(transferId, [
                providerReversal,
                { ...providerReversal, id: "trr_metadata_ambiguous" },
            ]);
        }
        this.nextTransferReversalListHasMore = scenario === "has-more";
    }

    private applyPaymentProviderProjection(body: JsonRecord): Response {
        const payment = this.tables.payments.find((row) => same(row.id, body.p_payment_id));
        if (!payment) {
            return jsonResponse({ message: "not_found: payment" }, 400);
        }
        this.applyNextProtectedPaymentProjectionScenario(payment);
        const projection = asRecord(body.p_projection);
        const expectedPayment = asRecord(body.p_expected_payment);
        const equivalentApply =
            !isDeepStrictEqual(payment, expectedPayment) &&
            this.isEquivalentPaymentApply(payment, expectedPayment, projection);
        if (!isDeepStrictEqual(payment, expectedPayment) && !equivalentApply) {
            return jsonResponse({ applied: false, payment: { ...payment } });
        }
        const snapshot = this.paymentProjectionSnapshot();
        if (equivalentApply) {
            this.update(payment, {
                last_provider_sync_at: this.latestProviderSyncAt(payment, projection),
            });
            const failed = this.paymentProjectionEnqueueFailure(snapshot);
            if (failed) {
                return failed;
            }
            this.enqueuePaymentProviderProjection(payment, String(projection.projectionKey));
        } else if (projection.kind === "apply") {
            this.update(payment, {
                payment_status: projection.paymentStatus,
                stripe_payment_intent_id: projection.stripePaymentIntentId,
                stripe_charge_id: projection.stripeChargeId,
                stripe_charge_balance_transaction_id: projection.stripeChargeBalanceTransactionId,
                actual_stripe_charge_fee_amount: projection.actualStripeChargeFeeAmount,
                actual_stripe_processing_fee_amount: projection.actualStripeProcessingFeeAmount,
                actual_stripe_charge_net_amount: projection.actualStripeChargeNetAmount,
                actual_stripe_fee_currency: projection.actualStripeFeeCurrency,
                actual_stripe_charge_fee_details: projection.actualStripeChargeFeeDetails,
                paid_at: projection.paidAt,
                cancelled_at: projection.cancelledAt,
                last_provider_sync_at: this.latestProviderSyncAt(payment, projection),
            });
            const recovered = this.recoverProjectedPaymentReview(payment, projection.recovery);
            const projectionKey = recovered
                ? String(projection.recoveredProjectionKey)
                : String(projection.projectionKey);
            const failed = this.paymentProjectionEnqueueFailure(snapshot);
            if (failed) {
                return failed;
            }
            this.enqueuePaymentProviderProjection(payment, projectionKey);
        } else if (projection.kind === "quarantine") {
            this.update(payment, {
                payment_status: projection.paymentStatus,
                settlement_status: projection.settlementStatus,
                manual_review_reason: projection.manualReviewReason,
                stripe_payment_intent_id: projection.stripePaymentIntentId,
                stripe_charge_id: projection.stripeChargeId,
                paid_at: projection.paidAt,
                last_provider_sync_at: this.latestProviderSyncAt(payment, projection),
            });
            const failed = this.paymentProjectionEnqueueFailure(snapshot);
            if (failed) {
                return failed;
            }
            this.enqueuePaymentProviderProjection(payment, String(projection.projectionKey));
            this.upsertProjectedProviderException(
                String(projection.exceptionKey),
                payment,
                String(projection.manualReviewReason),
                asRecord(projection.details),
            );
            this.insertGeneric("payment_events", {
                payment_id: payment.id,
                event_type: "provider_payment_truth_mismatch",
                actor_kind: projection.actorKind,
                actor_id: projection.actorId,
                previous_payment_status: null,
                next_payment_status: null,
                previous_settlement_status: null,
                next_settlement_status: null,
                data: projection.details,
            });
        } else {
            throw new Error(`unexpected payment provider projection kind ${String(projection.kind)}`);
        }
        if (this.losePaymentProjectionEnqueueResponse) {
            this.losePaymentProjectionEnqueueResponse = false;
            throw new Error("simulated lost payment projection response");
        }
        return jsonResponse({ applied: true, payment: { ...payment } });
    }

    private applyNextProtectedPaymentProjectionScenario(payment: JsonRecord): void {
        const scenario = this.nextProtectedPaymentProjectionScenario;
        if (!scenario) {
            return;
        }
        this.nextProtectedPaymentProjectionScenario = null;
        if (!same(payment.id, scenario.paymentId)) {
            throw new Error(`payment projection scenario expected payment ${scenario.paymentId}`);
        }
        const paymentIntentId = String(payment.stripe_payment_intent_id);
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent) {
            throw new Error(`payment projection scenario has no PaymentIntent ${paymentIntentId}`);
        }
        if (scenario.kind === "replace-intent") {
            this.paymentIntents.set(scenario.replacementIntentId, {
                ...intent,
                id: scenario.replacementIntentId,
                client_secret: `${scenario.replacementIntentId}_secret`,
            });
            this.update(payment, { stripe_payment_intent_id: scenario.replacementIntentId });
            return;
        }
        if (scenario.kind === "cancel-payment") {
            Object.assign(intent, {
                status: "canceled",
                canceled_at: Math.floor(Date.now() / 1000),
                client_secret: scenario.clientSecret,
            });
            this.update(payment, {
                payment_status: "cancelled",
                cancelled_at: "2026-07-06T12:09:00.000Z",
            });
            return;
        }
        intent.client_secret = scenario.clientSecret;
    }

    private latestProviderSyncAt(payment: JsonRecord, projection: JsonRecord): unknown {
        return Date.parse(String(payment.last_provider_sync_at)) > Date.parse(String(projection.lastProviderSyncAt))
            ? payment.last_provider_sync_at
            : projection.lastProviderSyncAt;
    }

    private isEquivalentPaymentApply(payment: JsonRecord, expected: JsonRecord, projection: JsonRecord): boolean {
        if (projection.kind !== "apply" || projection.recovery !== null || projection.recoveredProjectionKey !== null) {
            return false;
        }
        const target = {
            ...expected,
            payment_status: projection.paymentStatus,
            stripe_payment_intent_id: projection.stripePaymentIntentId,
            stripe_charge_id: projection.stripeChargeId,
            stripe_charge_balance_transaction_id: projection.stripeChargeBalanceTransactionId,
            actual_stripe_charge_fee_amount: projection.actualStripeChargeFeeAmount,
            actual_stripe_processing_fee_amount: projection.actualStripeProcessingFeeAmount,
            actual_stripe_charge_net_amount: projection.actualStripeChargeNetAmount,
            actual_stripe_fee_currency: projection.actualStripeFeeCurrency,
            actual_stripe_charge_fee_details: projection.actualStripeChargeFeeDetails,
            paid_at: projection.paidAt,
            cancelled_at: projection.cancelledAt,
            last_provider_sync_at: payment.last_provider_sync_at,
            updated_at: payment.updated_at,
        };
        if (expected.paid_at === null && payment.paid_at !== null && projection.paidAt !== null) {
            target.paid_at = payment.paid_at;
        }
        if (expected.cancelled_at === null && payment.cancelled_at !== null && projection.cancelledAt !== null) {
            target.cancelled_at = payment.cancelled_at;
        }
        return isDeepStrictEqual(payment, target);
    }

    private recoverProjectedPaymentReview(payment: JsonRecord, rawRecovery: unknown): boolean {
        if (!isRecord(rawRecovery)) {
            return false;
        }
        const recovery = rawRecovery;
        const reason = "Stripe payment provider truth mismatch: charge_balance_transaction_expansion";
        const exceptionKey = String(recovery.exceptionKey);
        this.upsertProjectedProviderException(exceptionKey, payment, reason, {
            paymentIntentId: recovery.paymentIntentId,
            chargeId: recovery.chargeId,
            mismatches: ["charge_balance_transaction_expansion"],
        });
        const hasOtherException = this.tables.provider_exceptions.some(
            (row) =>
                same(row.payment_id, payment.id) &&
                ["open", "investigating"].includes(String(row.status)) &&
                row.deduplication_key !== exceptionKey,
        );
        const recovered =
            payment.payment_status === "succeeded" &&
            payment.settlement_status === "manual_review" &&
            payment.manual_review_reason === reason &&
            payment.stripe_payment_intent_id === recovery.paymentIntentId &&
            payment.stripe_charge_id === recovery.chargeId &&
            payment.stripe_charge_balance_transaction_id === recovery.balanceTransactionId &&
            Number(payment.transferred_amount) === 0 &&
            Number(payment.reversed_amount) === 0 &&
            Number(payment.refunded_amount) === 0 &&
            payment.dispute_status === "none" &&
            !hasOtherException;
        if (!recovered) {
            return false;
        }
        this.update(payment, { settlement_status: "held", manual_review_reason: null });
        const exception = this.tables.provider_exceptions.find(
            (row) => row.deduplication_key === exceptionKey && ["open", "investigating"].includes(String(row.status)),
        );
        if (exception) {
            this.update(exception, {
                status: "resolved",
                resolved_at: "2026-07-06T12:10:00.000Z",
                resolved_by: "provider-truth-revalidation",
            });
        }
        this.insertGeneric("payment_events", {
            payment_id: payment.id,
            event_type: "provider_payment_truth_revalidated",
            actor_kind: recovery.actorKind,
            actor_id: recovery.actorId,
            previous_payment_status: "succeeded",
            next_payment_status: "succeeded",
            previous_settlement_status: "manual_review",
            next_settlement_status: "held",
            data: {
                resolvedReason: reason,
                paymentIntentId: recovery.paymentIntentId,
                chargeId: recovery.chargeId,
                balanceTransactionId: recovery.balanceTransactionId,
            },
        });
        return true;
    }

    private upsertProjectedProviderException(
        key: string,
        payment: JsonRecord,
        message: string,
        details: JsonRecord,
    ): void {
        const values = {
            deduplication_key: key,
            payment_id: payment.id,
            operation_id: null,
            exception_type: "provider_payment_truth_mismatch",
            severity: "critical",
            status: "open",
            message,
            details,
            resolved_at: null,
            resolved_by: null,
        };
        const existing = this.tables.provider_exceptions.find((row) => row.deduplication_key === key);
        if (existing) {
            this.update(existing, values);
        } else {
            this.insertGeneric("provider_exceptions", values);
        }
    }

    private enqueuePaymentProviderProjection(payment: JsonRecord, projectionKey: string): void {
        if (this.tables.commerce_projection_outbox.some((row) => row.projection_key === projectionKey)) {
            return;
        }
        this.insertGeneric("commerce_projection_outbox", {
            operation_id: null,
            payment_id: payment.id,
            projection_key: projectionKey,
            projection_kind: "payment",
            provider_object_id: String(payment.id),
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

    private paymentProjectionSnapshot(): {
        payments: JsonRecord[];
        outbox: JsonRecord[];
        exceptions: JsonRecord[];
        events: JsonRecord[];
        nextRowId: number;
    } {
        return structuredClone({
            payments: this.tables.payments,
            outbox: this.tables.commerce_projection_outbox,
            exceptions: this.tables.provider_exceptions,
            events: this.tables.payment_events,
            nextRowId: this.nextRowId,
        });
    }

    private paymentProjectionEnqueueFailure(
        snapshot: ReturnType<StripeConnectMock["paymentProjectionSnapshot"]>,
    ): Response | null {
        if (!this.failPaymentProjectionEnqueue) {
            return null;
        }
        this.failPaymentProjectionEnqueue = false;
        this.tables.payments = snapshot.payments;
        this.tables.commerce_projection_outbox = snapshot.outbox;
        this.tables.provider_exceptions = snapshot.exceptions;
        this.tables.payment_events = snapshot.events;
        this.nextRowId = snapshot.nextRowId;
        return jsonResponse({ message: "simulated payment projection enqueue failure" }, 500);
    }

    private insertGeneric(table: string, value: JsonRecord): JsonRecord {
        const now = "2026-07-06T12:05:00.000Z";
        const defaults =
            table === "refunds"
                ? {
                      stripe_refund_id: null,
                      stripe_balance_transaction_id: null,
                      failure_reason: null,
                      actual_stripe_fee_amount: 0,
                      actual_stripe_net_amount: null,
                      actual_stripe_fee_currency: null,
                      actual_stripe_fee_details: [],
                      provider_snapshot: null,
                  }
                : table === "stripe_dispute_evidence"
                  ? { staged_at: now, submitted_operation_id: null, submitted_at: null }
                  : {};
        const row = { id: this.nextRowId++, created_at: now, updated_at: now, ...defaults, ...value };
        this.tables[table].push(row);
        return { ...row };
    }

    update(row: JsonRecord, patch: JsonRecord): JsonRecord {
        Object.assign(row, patch, { updated_at: "2026-07-06T12:10:00.000Z" });
        return { ...row };
    }

    private enqueueCommerceProjection(operation: JsonRecord): void {
        if (
            operation.status !== "succeeded" ||
            !operation.payment_id ||
            !["transfer_create", "transfer_reversal_create"].includes(String(operation.operation_type)) ||
            this.tables.commerce_projection_outbox.some((row) => same(row.operation_id, operation.id))
        ) {
            return;
        }
        const request = asRecord(operation.request);
        const kind = operation.operation_type === "transfer_create" ? "transfer" : "reversal";
        const recoveryKey = kind === "reversal" ? request.recoveryRequestId : null;
        this.insertGeneric("commerce_projection_outbox", {
            operation_id: operation.id,
            payment_id: operation.payment_id,
            projection_key: `operation:${operation.id}`,
            projection_kind: kind,
            provider_object_id: null,
            projection_payload: {},
            recovery_key: recoveryKey,
            causal_sequence: kind === "reversal" ? Number(request.allocationIndex ?? 0) : 0,
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
}
