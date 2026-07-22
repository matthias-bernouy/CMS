import { callRpcObject, getRowByField, insertRow, rest, restError, updateRow, upsertRow } from "./db/postgrest.ts";
import type { DisputeDashboardRead } from "./db/dashboard-reads.ts";
import {
    insertPaymentEvent,
    insertStripeEventDurably,
    upsertProviderException,
} from "./db/repositories/events-exceptions.ts";
import {
    enqueueCommerceProviderProjection,
    reserveFinancialOperation,
    updateFinancialOperation,
} from "./db/repositories/financial-operations.ts";
import {
    sumConfirmedRecoveryAmount,
    sumSucceededRefundSellerRecovery,
    sumSucceededTransferReversalAmounts,
} from "./db/repositories/ledger.ts";
import { getPaymentRow, updatePayment } from "./db/repositories/payments.ts";
import { markPaymentManualReview } from "./db/repositories/payout-controls.ts";
import type { ConnectAccountRow } from "./db/records/accounts.ts";
import { disputeSelect, type StripeDisputeRow } from "./db/records/disputes.ts";
import type { FinancialOperationRow, PlatformPayoutControlRow } from "./db/records/operations.ts";
import type { ConnectPaymentRow } from "./db/records/payments.ts";
import { readStripeDisputeApplicationContext } from "./db/reconciliation.ts";
import { requireCmsRequest } from "./http/auth.ts";
import { assertAllowedKeys, readJsonObject, requiredInteger, requiredString } from "./http/body.ts";
import { HttpError } from "./http/errors.ts";
import { json } from "./http/responses.ts";
import { serveStripeConnect } from "./http/router.ts";
import { retrieveStripeBalanceTransaction } from "./provider/payments.ts";
import type { StripeDispute } from "./provider/types.ts";
import {
    getProviderException,
    listFinancialOperations,
    listProviderExceptions,
    requeueCommerceProjection,
} from "./routes/admin/dashboard.ts";
import { connectEnrollment, connectVerification } from "./routes/accounts/enrollment.ts";
import {
    adminCreateOnboarding,
    adminCreateOnboardingSession,
    connectOnboarding,
    connectOnboardingSession,
} from "./routes/accounts/onboarding.ts";
import { connectStatus, connectWallet, getSellerProviderRisk } from "./routes/accounts/status.ts";
import { syncAccountForIdentity } from "./routes/accounts/sync.ts";
import { createAcceptStripeDispute } from "./routes/disputes/acceptance.ts";
import { getStripeDispute, listStripeDisputes } from "./routes/disputes/dashboard.ts";
import { createUploadStripeDisputeFile } from "./routes/disputes/files.ts";
import { createStageStripeDisputeEvidence } from "./routes/disputes/staging.ts";
import { createSubmitStripeDisputeEvidence } from "./routes/disputes/submission.ts";
import { requestPaymentIntentCancellation } from "./routes/payments/cancellation.ts";
import { getProviderPayment, listProviderPayments } from "./routes/payments/dashboard.ts";
import { createProtectedPaymentRoutes } from "./routes/payments/protected.ts";
import { createRequestSettlementRelease } from "./routes/payments/settlement-release.ts";
import { createRequestTransferReversal } from "./routes/payments/transfer-reversal.ts";
import { createConfigurePlatformPayoutProtection } from "./routes/payouts/platform-protection.ts";
import { createConfigureSellerPayoutSchedule } from "./routes/payouts/seller-schedule.ts";
import { createReconcileProviderPayment } from "./routes/reconciliation/payment.ts";
import { createRunProviderReconciliation } from "./routes/reconciliation/run.ts";
import { getProviderRefund, listProviderRefunds } from "./routes/refunds/dashboard.ts";
import { createRequestProtectedRefund } from "./routes/refunds/protected.ts";
import { connectConfig, health } from "./routes/system.ts";
import { digest } from "./shared/crypto.ts";
import { arrayAt, errorMessage, isRecord, numberAt, objectAt, stringAt } from "./shared/data.ts";
import type { JsonRecord } from "./shared/types.ts";
import { createRefundExecutionWorkflow } from "./workflows/refunds/execution.ts";
import { createRefundProjectionWorkflow } from "./workflows/refunds/projection.ts";
import { createProtectedRefundWorkflow } from "./workflows/refunds/protected.ts";
import { createProtectedPaymentWorkflow } from "./workflows/payments/creation/workflow.ts";
import { createSettlementReleaseWorkflow } from "./workflows/payments/settlement-release.ts";
import { createTransferReversalWorkflow } from "./workflows/payments/transfer-reversal/workflow.ts";
import { createSellerRecoveryPayoutHold } from "./workflows/payouts/seller-hold.ts";
import { createSellerPayoutRestoration } from "./workflows/payouts/seller-restoration.ts";
import { createPaymentReconciliationWorkflow } from "./workflows/reconciliation/payment.ts";
import { createPaymentOperationRecovery } from "./workflows/reconciliation/operations/payment.ts";
import { createPayoutScheduleOperationRecovery } from "./workflows/reconciliation/operations/payout-schedule.ts";
import { createProviderObjectReconciliation } from "./workflows/reconciliation/provider-objects.ts";
import { createAccountPayoutHoldReconciliation } from "./workflows/reconciliation/account-holds.ts";
import { createProviderReconciliationRun } from "./workflows/reconciliation/run.ts";
import { createStripeWebhookIngress } from "./workflows/webhooks/ingress.ts";
import { createStripeEventProcessor } from "./workflows/webhooks/processing.ts";

const createProtectedPaymentForBuyer = createProtectedPaymentWorkflow({ syncAccountForIdentity });
const {
    checkSellerHeldPaymentEligibility,
    createProtectedPayment,
    getProtectedPayment,
    getProtectedPaymentByReference,
} = createProtectedPaymentRoutes({ createProtectedPaymentForBuyer, syncAccountForIdentity });
const executeTransferReversal = createTransferReversalWorkflow({
    moveOperationToManualReview,
    recordSellerRecoveryExposure,
});
const requestTransferReversal = createRequestTransferReversal({ executeTransferReversal, requiredPayment });
const applyStripeRefund = createRefundProjectionWorkflow();
const { reconcileProviderDisputes, reconcileProviderRefunds, reconcileProviderTransfers } =
    createProviderObjectReconciliation({ applyStripeDispute, applyStripeRefund });
const reconcilePayment = createPaymentReconciliationWorkflow({
    applyStripeRefund,
    reconcileProviderDisputes,
    reconcileProviderRefunds,
    reconcileProviderTransfers,
    requiredPayment,
});
const reconcileProviderPayment = createReconcileProviderPayment({ reconcilePayment, requiredPayment });
const processStripeEvent = createStripeEventProcessor({ applyStripeDispute, applyStripeRefund, reconcilePayment });
const { applyClaimedSellerRecoveryPayoutHold, enforceSellerRecoveryPayoutHold } = createSellerRecoveryPayoutHold({
    sellerRiskAccount,
});
const restoreSellerAutomaticPayoutSchedule = createSellerPayoutRestoration({
    sellerRiskAccount,
    applyClaimedSellerRecoveryPayoutHold,
});
const reconcileAccountPayoutHolds = createAccountPayoutHoldReconciliation({
    enforceSellerRecoveryPayoutHold,
    restoreSellerAutomaticPayoutSchedule,
});
const executeProviderReconciliationRun = createProviderReconciliationRun({
    moveOperationToManualReview,
    processClaimedFinancialOperation,
    processStripeEvent,
    reconcileAccountPayoutHolds,
    reconcilePayment,
});
const runProviderReconciliation = createRunProviderReconciliation({ executeProviderReconciliationRun });
const executeSettlementRelease = createSettlementReleaseWorkflow({
    reconcilePayment,
    moveOperationToManualReview,
});
const requestSettlementRelease = createRequestSettlementRelease({
    executeSettlementRelease,
    requiredPayment,
});
const executeRefund = createRefundExecutionWorkflow({ applyStripeRefund, moveOperationToManualReview });
const recoverPayoutScheduleOperation = createPayoutScheduleOperationRecovery({
    sellerRiskAccount,
    applyClaimedSellerRecoveryPayoutHold,
    restoreSellerAutomaticPayoutSchedule,
});
const recoverPaymentOperation = createPaymentOperationRecovery({
    requiredPayment,
    executeSettlementRelease,
    executeTransferReversal,
    executeRefund,
});
const executeProtectedRefund = createProtectedRefundWorkflow({
    executeRefund,
    executeTransferReversal,
    recordSellerRecoveryExposure,
    requiredPayment,
});
const requestProtectedRefund = createRequestProtectedRefund({
    executeProtectedRefund,
    reconcilePayment,
    requiredPayment,
});
const uploadStripeDisputeFile = createUploadStripeDisputeFile({ requiredDispute });
const stageStripeDisputeEvidence = createStageStripeDisputeEvidence({ requiredDispute, terminalDisputeStatus });
const disputeRouteDependencies = {
    requiredDispute,
    terminalDisputeStatus,
    authorizeIrreversibleDisputeAction,
    moveOperationToManualReview,
};
const submitStripeDisputeEvidence = createSubmitStripeDisputeEvidence(disputeRouteDependencies);
const acceptStripeDispute = createAcceptStripeDispute(disputeRouteDependencies);
const configurePlatformPayoutProtection = createConfigurePlatformPayoutProtection({ platformPayoutControl });
const configureSellerPayoutSchedule = createConfigureSellerPayoutSchedule({
    sellerRiskAccount,
    applyClaimedSellerRecoveryPayoutHold,
});
const stripeWebhookIngress = createStripeWebhookIngress({ insertStripeEventDurably });

serveStripeConnect({
    ...stripeWebhookIngress,
    health,
    connectConfig,
    connectStatus,
    connectWallet,
    connectEnrollment,
    connectVerification,
    connectOnboarding,
    connectOnboardingSession,
    checkSellerHeldPaymentEligibility,
    createProtectedPayment,
    getProtectedPayment,
    getProtectedPaymentByReference,
    requestPaymentIntentCancellation,
    requestSettlementRelease,
    requestTransferReversal,
    requestProtectedRefund,
    reconcileProviderPayment,
    runProviderReconciliation,
    acknowledgeCommerceProjection,
    failCommerceProjection,
    configurePlatformPayoutProtection,
    getSellerProviderRisk,
    configureSellerPayoutSchedule,
    adminCreateOnboarding,
    adminCreateOnboardingSession,
    listProviderPayments,
    getProviderPayment,
    listProviderRefunds,
    getProviderRefund,
    listStripeDisputes,
    getStripeDispute,
    uploadStripeDisputeFile,
    stageStripeDisputeEvidence,
    submitStripeDisputeEvidence,
    acceptStripeDispute,
    listProviderExceptions,
    getProviderException,
    requeueCommerceProjection,
    listFinancialOperations,
});

async function acknowledgeCommerceProjection(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["projectionId", "claimToken"]);
    const result = await callRpcObject<JsonRecord>("ack_commerce_projection_outbox", {
        p_projection_id: requiredInteger(body, "projectionId"),
        p_claim_token: requiredString(body, "claimToken", 100),
    });
    return json({ acknowledged: true, projectionId: result.id });
}

async function failCommerceProjection(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["projectionId", "claimToken", "error"]);
    const result = await callRpcObject<JsonRecord>("fail_commerce_projection_outbox", {
        p_projection_id: requiredInteger(body, "projectionId"),
        p_claim_token: requiredString(body, "claimToken", 100),
        p_error: requiredString(body, "error", 2000),
    });
    return json({
        failed: true,
        projectionId: result.id,
        status: result.projection_status,
        nextAttemptAt: result.next_attempt_at,
    });
}

async function processClaimedFinancialOperation(operation: FinancialOperationRow): Promise<boolean> {
    if (operation.operation_type === "payout_schedule_update" && !operation.payment_id) {
        return await recoverPayoutScheduleOperation(operation);
    }
    return await recoverPaymentOperation(operation);
}

async function requiredPayment(paymentId: number): Promise<ConnectPaymentRow> {
    const payment = await getPaymentRow(paymentId);
    if (!payment) {
        throw new HttpError(404, "payment not found");
    }
    return payment;
}

async function authorizedSellerAmountAfterRefunds(payment: ConnectPaymentRow): Promise<number> {
    return payment.seller_transfer_amount - (await sumSucceededRefundSellerRecovery(payment.id));
}

async function recordSellerRecoveryExposure(
    payment: ConnectPaymentRow,
    recoveryKey: string,
    exposureType: "chargeback" | "refund_recovery" | "reversal_failure",
    status: "at_risk" | "debt" | "recovered",
    amount: number,
    reason: string,
    details: JsonRecord,
    recoveredAmount?: number,
): Promise<void> {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        return;
    }
    const response = await rest("rpc/upsert_seller_recovery_exposure_and_refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_seller_cms_user_id: payment.seller_cms_user_id,
            p_payment_id: payment.id,
            p_recovery_key: recoveryKey,
            p_exposure_type: exposureType,
            p_status: status,
            p_amount: amount,
            p_currency: payment.currency,
            p_reason: reason,
            p_details: details,
            p_recovered_amount: recoveredAmount,
        }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const result = (await response.json()) as JsonRecord;
    const exposure = objectAt(result, "exposure");
    if (exposure.status === "debt") {
        await upsertProviderException(`seller-debt:${recoveryKey}`, {
            payment_id: payment.id,
            exception_type: "seller_recovery_debt",
            severity: "critical",
            message: reason,
            details: { recoveryKey, amount, sellerUserId: payment.seller_cms_user_id, ...details },
        });
    }
    // Provider payout controls are a second line of defence. Their outage must
    // never prevent the idempotent Transfer Reversal that can recover the funds.
    await enforceSellerRecoveryPayoutHold(payment.seller_cms_user_id).catch(() => null);
}

function platformPayoutControl(result: JsonRecord): PlatformPayoutControlRow {
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

function sellerRiskAccount(result: JsonRecord): ConnectAccountRow {
    const account = objectAt(result, "account") as unknown as ConnectAccountRow;
    if (!account.cms_user_id) {
        throw new Error("Seller payout hold RPC returned no account");
    }
    return account;
}

async function moveOperationToManualReview(
    paymentId: number,
    operation: FinancialOperationRow,
    error: unknown,
    exceptionType: string,
): Promise<void> {
    const message = errorMessage(error);
    await updateFinancialOperation(operation.id, { status: "manual_review", last_error: message }).catch(() => null);
    await markPaymentManualReview(paymentId, message, { operationId: operation.id, exceptionType }).catch(() => null);
    await insertRow<JsonRecord>("provider_exceptions", "*", {
        payment_id: paymentId,
        operation_id: operation.id,
        exception_type: exceptionType,
        severity: "critical",
        message,
        details: { businessKey: operation.business_key, operationType: operation.operation_type },
    }).catch(() => null);
}

async function requiredDispute(disputeId: string): Promise<StripeDisputeRow> {
    const row = await getRowByField<StripeDisputeRow>("stripe_disputes", "stripe_dispute_id", disputeId, disputeSelect);
    if (!row) {
        throw new HttpError(404, "Stripe dispute not found");
    }
    return row;
}

async function authorizeIrreversibleDisputeAction(options: {
    actionKey: string;
    actionType: "dispute_evidence_submit" | "dispute_accept";
    dispute: StripeDisputeRow;
    actorId: string;
    actorKind: "admin";
    payload: JsonRecord;
}): Promise<{
    approved: boolean;
    dualApprovalRequired: boolean;
    approvalStatus: string;
    firstApprovedBy: string;
    secondApprovedBy?: string;
}> {
    if (options.actorKind !== "admin") {
        throw new HttpError(403, "admin approval actor is required");
    }
    const response = await rest("rpc/authorize_irreversible_dispute_action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_action_key: options.actionKey,
            p_action_type: options.actionType,
            p_dispute_id: options.dispute.id,
            p_amount: options.dispute.amount,
            p_actor_kind: options.actorKind,
            p_actor_id: options.actorId,
            p_payload_sha256: await digest(JSON.stringify(options.payload)),
        }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const result = await response.json();
    if (
        !isRecord(result) ||
        typeof result.approved !== "boolean" ||
        typeof result.dualApprovalRequired !== "boolean" ||
        typeof result.approvalStatus !== "string" ||
        typeof result.firstApprovedBy !== "string"
    ) {
        throw new HttpError(502, "irreversible dispute approval returned an invalid response");
    }
    return {
        approved: result.approved,
        dualApprovalRequired: result.dualApprovalRequired,
        approvalStatus: result.approvalStatus,
        firstApprovedBy: result.firstApprovedBy,
        secondApprovedBy: typeof result.secondApprovedBy === "string" ? result.secondApprovedBy : undefined,
    };
}

type DisputeFundsTruth = { fundsWithdrawn: boolean; eventAt: string; eventId: string };

async function disputeFundsTruth(
    provider: StripeDispute,
    eventId: string,
    eventType?: string,
    eventCreatedAt?: string | null,
): Promise<DisputeFundsTruth | null> {
    if (eventType === "charge.dispute.funds_withdrawn" || eventType === "charge.dispute.funds_reinstated") {
        const createdAt = eventCreatedAt ? Date.parse(eventCreatedAt) : Number.NaN;
        if (!Number.isFinite(createdAt)) {
            throw new Error("Stripe dispute funds event has no valid creation time");
        }
        return {
            fundsWithdrawn: eventType === "charge.dispute.funds_withdrawn",
            eventAt: new Date(createdAt).toISOString(),
            eventId,
        };
    }
    const transactions: JsonRecord[] = [];
    for (const entry of arrayAt(provider, "balance_transactions")) {
        if (isRecord(entry)) {
            transactions.push(entry);
            continue;
        }
        if (typeof entry === "string" && entry) {
            transactions.push(await retrieveStripeBalanceTransaction(entry));
        }
    }
    const ordered = transactions
        .filter(
            (transaction) =>
                Number.isSafeInteger(transaction.created) &&
                Number.isSafeInteger(transaction.amount) &&
                Number(transaction.amount) !== 0 &&
                stringAt(transaction, "id"),
        )
        .sort(
            (left, right) =>
                Number(right.created) - Number(left.created) ||
                stringAt(right, "id").localeCompare(stringAt(left, "id")),
        );
    const latest = ordered[0];
    if (!latest) {
        return null;
    }
    const latestCreated = Number(latest.created);
    const latestTransactions = ordered.filter((transaction) => Number(transaction.created) === latestCreated);
    const hasWithdrawal = latestTransactions.some((transaction) => Number(transaction.amount) < 0);
    const hasReinstatement = latestTransactions.some((transaction) => Number(transaction.amount) > 0);
    return {
        fundsWithdrawn: hasWithdrawal,
        eventAt: new Date(latestCreated * 1000).toISOString(),
        eventId:
            hasWithdrawal && hasReinstatement
                ? "balance-transaction:same-second-conflict"
                : `balance-transaction:${stringAt(latest, "id")}`,
    };
}

async function applyStripeDispute(
    provider: StripeDispute,
    eventId: string,
    eventType?: string,
    eventCreatedAt?: string | null,
): Promise<void> {
    const disputeId = provider.id;
    const charge = typeof provider.charge === "string" ? provider.charge : stringAt(objectAt(provider, "charge"), "id");
    if (!charge) {
        throw new Error("Stripe dispute has no charge id");
    }
    const context = await readStripeDisputeApplicationContext(charge, disputeId);
    const payment = context.payment as unknown as ConnectPaymentRow | null;
    if (!payment) {
        throw new Error(`Stripe dispute ${disputeId} has no local payment`);
    }
    const status = stringAt(provider, "status") || "needs_response";
    const evidenceDetails = objectAt(provider, "evidence_details");
    const dueBy = numberAt(evidenceDetails, "due_by");
    const existingDispute = context.dispute as unknown as StripeDisputeRow | null;
    const submissionCount = numberAt(evidenceDetails, "submission_count") ?? 0;
    const balanceTransactions = arrayAt(provider, "balance_transactions")
        .map((entry) => (typeof entry === "string" ? entry : isRecord(entry) ? stringAt(entry, "id") : ""))
        .filter(Boolean);
    const fundsTruth = await disputeFundsTruth(provider, eventId, eventType, eventCreatedAt);
    const values = {
        payment_id: payment.id,
        stripe_dispute_id: disputeId,
        stripe_charge_id: charge,
        amount: Number(provider.amount ?? 0),
        currency: stringAt(provider, "currency").toLowerCase(),
        reason: stringAt(provider, "reason") || null,
        status,
        evidence_status: terminalDisputeStatus(status)
            ? "closed"
            : submissionCount > 0
              ? "submitted"
              : (existingDispute?.evidence_status ?? "not_started"),
        evidence_due_by: dueBy ? new Date(dueBy * 1000).toISOString() : null,
        is_charge_refundable: typeof provider.is_charge_refundable === "boolean" ? provider.is_charge_refundable : null,
        funds_withdrawn: existingDispute?.funds_withdrawn ?? false,
        balance_transaction_ids: balanceTransactions,
        provider_snapshot: provider,
    };
    let dispute = await upsertRow<StripeDisputeRow>("stripe_disputes", "stripe_dispute_id", disputeSelect, values);
    if (fundsTruth) {
        dispute = await callRpcObject<StripeDisputeRow>("apply_dispute_funds_truth", {
            p_stripe_dispute_id: disputeId,
            p_event_at: fundsTruth.eventAt,
            p_event_id: fundsTruth.eventId,
            p_funds_withdrawn: fundsTruth.fundsWithdrawn,
        });
    }
    const fundsWithdrawn = dispute.funds_withdrawn;
    const closesWithoutLoss = ["won", "prevented", "warning_closed"].includes(status) && !fundsWithdrawn;
    const localDisputeStatus =
        !closesWithoutLoss && fundsWithdrawn
            ? "open"
            : status === "won"
              ? "won"
              : status === "lost"
                ? "lost"
                : status === "prevented"
                  ? "prevented"
                  : status === "warning_closed"
                    ? "warning_closed"
                    : status.includes("under_review")
                      ? "under_review"
                      : "open";
    const preservesExistingManualReview =
        payment.settlement_status === "manual_review" &&
        payment.manual_review_reason !== `Stripe dispute ${disputeId} after Transfer`;
    const authorizedSellerAmount = await authorizedSellerAmountAfterRefunds(payment);
    const netTransferredAmount = payment.transferred_amount - payment.reversed_amount;
    const safeSettlementStatus =
        payment.refunded_amount >= payment.amount_total
            ? "refunded"
            : netTransferredAmount >= authorizedSellerAmount
              ? "released"
              : "held";
    await updatePayment(payment.id, {
        dispute_status: localDisputeStatus,
        settlement_status: preservesExistingManualReview
            ? "manual_review"
            : closesWithoutLoss
              ? safeSettlementStatus
              : netTransferredAmount > 0
                ? "manual_review"
                : "blocked",
        manual_review_reason: preservesExistingManualReview
            ? payment.manual_review_reason
            : !closesWithoutLoss && netTransferredAmount > 0
              ? `Stripe dispute ${disputeId} after Transfer`
              : closesWithoutLoss
                ? null
                : payment.manual_review_reason,
        last_stripe_event_id: eventId.startsWith("evt_") ? eventId : payment.last_stripe_event_id,
        last_provider_sync_at: new Date().toISOString(),
    });
    await insertPaymentEvent(payment.id, "stripe_dispute_updated", "webhook", eventId, {
        disputeId,
        status,
        amount: values.amount,
    });
    await enqueueCommerceProviderProjection(
        payment.id,
        `dispute:${dispute.id}:${eventId}:${status}:${fundsWithdrawn ? "withdrawn" : "available"}`,
        "dispute",
        String(dispute.id),
    );

    const recoveryKey = `stripe-dispute:${dispute.id}`;
    const sellerExposureAmount = Math.min(
        Number(provider.amount ?? 0),
        Math.max(0, payment.transferred_amount - payment.reversed_amount),
    );
    if (status === "lost" && sellerExposureAmount > 0) {
        await recordSellerRecoveryExposure(
            payment,
            recoveryKey,
            "chargeback",
            "debt",
            sellerExposureAmount,
            "Stripe dispute was lost before seller funds were fully recovered",
            { disputeId, status },
        );
    } else if ((!terminalDisputeStatus(status) || fundsWithdrawn) && sellerExposureAmount > 0) {
        await recordSellerRecoveryExposure(
            payment,
            recoveryKey,
            "chargeback",
            "at_risk",
            sellerExposureAmount,
            "Open Stripe dispute exposes transferred seller funds",
            { disputeId, status, fundsWithdrawn },
        );
    } else if (closesWithoutLoss) {
        const existingExposure = await getRowByField<JsonRecord>(
            "seller_recovery_exposures",
            "recovery_key",
            recoveryKey,
            "*",
        );
        const exposureAmount = Number(existingExposure?.amount ?? 0);
        if (exposureAmount > 0) {
            await recordSellerRecoveryExposure(
                payment,
                recoveryKey,
                "chargeback",
                "recovered",
                exposureAmount,
                "Stripe dispute closed without an outstanding seller debt",
                { disputeId, status },
            );
        }
    }

    if ((!terminalDisputeStatus(status) || fundsWithdrawn) && payment.transferred_amount > payment.reversed_amount) {
        const recoveryAmount = Math.min(
            Number(provider.amount ?? 0),
            payment.transferred_amount - payment.reversed_amount,
        );
        if (recoveryAmount > 0) {
            try {
                await executeTransferReversal(
                    payment,
                    `stripe-dispute:${dispute.id}`,
                    recoveryAmount,
                    `Stripe dispute ${disputeId}`,
                );
            } catch (error) {
                await recordSellerRecoveryExposure(
                    payment,
                    recoveryKey,
                    "chargeback",
                    "debt",
                    recoveryAmount,
                    "Stripe dispute Transfer recovery failed",
                    { disputeId, error: errorMessage(error) },
                ).catch(() => null);
                await markPaymentManualReview(payment.id, "Stripe dispute Transfer recovery failed", {
                    disputeId,
                    error: errorMessage(error),
                });
            }
        }
    }
}

function terminalDisputeStatus(status: string): boolean {
    return ["won", "lost", "warning_closed", "prevented"].includes(status);
}
