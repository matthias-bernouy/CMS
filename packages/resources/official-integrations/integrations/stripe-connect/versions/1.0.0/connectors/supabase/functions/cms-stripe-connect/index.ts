import { callRpcObject, getRowByField, insertRow, rest, restError, updateRow } from "./db/postgrest.ts";
import type { DisputeDashboardRead } from "./db/dashboard-reads.ts";
import { insertStripeEventDurably, upsertProviderException } from "./db/repositories/events-exceptions.ts";
import { reserveFinancialOperation, updateFinancialOperation } from "./db/repositories/financial-operations.ts";
import { sumConfirmedRecoveryAmount, sumSucceededTransferReversalAmounts } from "./db/repositories/ledger.ts";
import { getPaymentRow } from "./db/repositories/payments.ts";
import { markPaymentManualReview } from "./db/repositories/payout-controls.ts";
import type { ConnectAccountRow } from "./db/records/accounts.ts";
import { disputeSelect, type StripeDisputeRow } from "./db/records/disputes.ts";
import type { FinancialOperationRow, PlatformPayoutControlRow } from "./db/records/operations.ts";
import type { ConnectPaymentRow } from "./db/records/payments.ts";
import { terminalDisputeStatus } from "./domain/disputes/status.ts";
import { requireCmsRequest } from "./http/auth.ts";
import { assertAllowedKeys, readJsonObject, requiredInteger, requiredString } from "./http/body.ts";
import { HttpError } from "./http/errors.ts";
import { json } from "./http/responses.ts";
import { serveStripeConnect } from "./http/router.ts";
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
import { errorMessage, objectAt } from "./shared/data.ts";
import type { JsonRecord } from "./shared/types.ts";
import { createRefundExecutionWorkflow } from "./workflows/refunds/execution.ts";
import { createRefundProjectionWorkflow } from "./workflows/refunds/projection.ts";
import { createProtectedRefundWorkflow } from "./workflows/refunds/protected.ts";
import { createProtectedPaymentWorkflow } from "./workflows/payments/creation/workflow.ts";
import { createSettlementReleaseWorkflow } from "./workflows/payments/settlement-release.ts";
import { createTransferReversalWorkflow } from "./workflows/payments/transfer-reversal/workflow.ts";
import { createSellerRecoveryPayoutHold } from "./workflows/payouts/seller-hold.ts";
import { createSellerPayoutRestoration } from "./workflows/payouts/seller-restoration.ts";
import { createStripeDisputeApplication } from "./workflows/disputes/application.ts";
import { authorizeIrreversibleDisputeAction } from "./workflows/disputes/authorization.ts";
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
const applyStripeDispute = createStripeDisputeApplication({
    recordSellerRecoveryExposure,
    executeTransferReversal,
});
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
