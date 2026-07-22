import { defaultCurrency, protectedPlatformPayoutInterval, stripeV1ApiVersion } from "./shared/runtime.ts";
import {
    callRpcObject,
    callRpcRows,
    getRowByField,
    insertRow,
    listRows,
    rest,
    restError,
    updateRow,
    upsertRow,
} from "./db/postgrest.ts";
import type { DisputeDashboardRead } from "./db/dashboard-reads.ts";
import { getAccountRow, getMarketplaceTermsAcceptance, updateAccountRow } from "./db/repositories/accounts.ts";
import {
    insertPaymentEvent,
    insertStripeEventDurably,
    resolveProviderException,
    upsertProviderException,
} from "./db/repositories/events-exceptions.ts";
import {
    enqueueCommerceProviderProjection,
    enqueueCommerceRefundProjection,
    reserveAccountFinancialOperation,
    reserveFinancialOperation,
    updateFinancialOperation,
} from "./db/repositories/financial-operations.ts";
import {
    sumConfirmedRecoveryAmount,
    sumSucceededRefundSellerRecovery,
    sumSucceededTransferReversalAmounts,
} from "./db/repositories/ledger.ts";
import {
    getPaymentByClientReference,
    getPaymentRow,
    reserveProtectedPayment,
    updatePayment,
} from "./db/repositories/payments.ts";
import { markPaymentManualReview, sellerPayoutHoldRpc } from "./db/repositories/payout-controls.ts";
import { accountSelect, type ConnectAccountRow } from "./db/records/accounts.ts";
import { disputeSelect, type StripeDisputeRow } from "./db/records/disputes.ts";
import {
    operationSelect,
    type CommerceProjectionOutboxRow,
    type FinancialOperationRow,
    type PlatformPayoutControlRow,
} from "./db/records/operations.ts";
import { paymentSelect, type ConnectPaymentRow } from "./db/records/payments.ts";
import { refundSelect, type RefundRow } from "./db/records/refunds.ts";
import type { TransferRecoveryRow, TransferRow } from "./db/records/transfers.ts";
import {
    claimReconciliationProjectionBatch,
    readFinancialOperationRecoveryContext,
    readReconciliationOperations,
    readStripeDisputeApplicationContext,
} from "./db/reconciliation.ts";
import {
    bankPayoutsStatus,
    sellerCanAcceptHeldPayments,
    stripeTransfersStatus,
} from "./domain/accounts/eligibility.ts";
import { balanceSettingsMatchRequest, publicBalanceSettings } from "./domain/accounts/payout-settings.ts";
import { publicPayment, publicPaymentWithClientSecret } from "./domain/payments/presentation.ts";
import { publicFinancialOperation } from "./domain/admin/financial-operation.ts";
import { projectPublicDisputeWithContext } from "./domain/disputes/presentation.ts";
import { requireCmsRequest } from "./http/auth.ts";
import {
    assertAllowedKeys,
    marketplaceTermsExpectationFromBody,
    optionalCurrency,
    optionalPositiveInteger,
    readJsonObject,
    requiredHash,
    requiredInteger,
    requiredString,
    validBusinessType,
} from "./http/body.ts";
import { HttpError } from "./http/errors.ts";
import { requiredQueryInteger, requiredQueryText, requiredReleaseKind } from "./http/query.ts";
import { json } from "./http/responses.ts";
import { serveStripeConnect } from "./http/router.ts";
import {
    retrieveConnectedBalanceSettings,
    retrievePlatformBalanceSettings,
    updateBalanceSettings,
} from "./provider/accounts/balances.ts";
import {
    createStripePaymentIntent,
    retrievePaymentIntent,
    retrieveStripeBalanceTransaction,
} from "./provider/payments.ts";
import { retrieveStripeRefundSnapshot } from "./provider/refunds.ts";
import {
    createStripeTransferReversal,
    listStripeTransferReversals,
    retrieveStripeTransferReversal,
} from "./provider/transfers.ts";
import type { StripeBalanceSettings, StripeDispute, StripePaymentIntent } from "./provider/types.ts";
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
import { getProviderRefund, listProviderRefunds } from "./routes/refunds/dashboard.ts";
import { createRequestProtectedRefund } from "./routes/refunds/protected.ts";
import { connectConfig, health } from "./routes/system.ts";
import { digest, stableStripeIdempotencyKey } from "./shared/crypto.ts";
import {
    arrayAt,
    errorMessage,
    isRecord,
    numberAt,
    objectAt,
    stringArrayAt,
    stringAt,
    stripeObjectId,
    stripUndefined,
    unique,
} from "./shared/data.ts";
import type { JsonRecord } from "./shared/types.ts";
import {
    optionalOperationInteger,
    optionalOperationString,
    requiredOperationInteger,
    requiredOperationString,
} from "./workflows/operations/request-values.ts";
import { createRefundExecutionWorkflow } from "./workflows/refunds/execution.ts";
import { createRefundProjectionWorkflow } from "./workflows/refunds/projection.ts";
import { createProtectedRefundWorkflow } from "./workflows/refunds/protected.ts";
import { executePaymentIntentCancellation } from "./workflows/payments/cancellation.ts";
import { createProtectedPaymentWorkflow } from "./workflows/payments/creation/workflow.ts";
import { createSettlementReleaseWorkflow } from "./workflows/payments/settlement-release.ts";
import { createTransferReversalWorkflow } from "./workflows/payments/transfer-reversal/workflow.ts";
import { applyPaymentIntent, paymentClientSecret } from "./workflows/payments/projection.ts";
import { createPaymentReconciliationWorkflow } from "./workflows/reconciliation/payment.ts";
import { createProviderObjectReconciliation } from "./workflows/reconciliation/provider-objects.ts";
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
const executeSettlementRelease = createSettlementReleaseWorkflow({
    reconcilePayment,
    moveOperationToManualReview,
});
const requestSettlementRelease = createRequestSettlementRelease({
    executeSettlementRelease,
    requiredPayment,
});
const executeRefund = createRefundExecutionWorkflow({ applyStripeRefund, moveOperationToManualReview });
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
const processStripeEvent = createStripeEventProcessor({ applyStripeDispute, applyStripeRefund, reconcilePayment });

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

async function runProviderReconciliation(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["runKey", "limit"]);
    const runKey = requiredString(body, "runKey", 200);
    const limit = Math.min(optionalPositiveInteger(body, "limit") ?? 50, 200);
    let run = await getRowByField<JsonRecord>("reconciliation_runs", "run_key", runKey, "*");
    if (run && ["succeeded", "manual_review"].includes(String(run.status))) {
        return json(await publicReconciliationRun(run, limit, `commerce:${runKey}`));
    }
    if (!run) {
        run = await insertRow<JsonRecord>("reconciliation_runs", "*", { run_key: runKey, status: "running" });
    }

    let scanned = 0;
    let repaired = 0;
    let exceptions = 0;
    let platformPayoutInterval = "unknown";
    let platformPayoutMinimum = 0;
    let platformRequiredMinimum = 0;
    let remainingWorkBudget = limit;
    try {
        const [platformSettings, platformControl] = await Promise.all([
            retrievePlatformBalanceSettings(),
            getRowByField<PlatformPayoutControlRow>("platform_payout_controls", "control_key", "default", "*"),
        ]);
        if (!platformControl) {
            throw new Error("platform payout control state is unavailable");
        }
        platformPayoutInterval =
            stringAt(objectAt(objectAt(objectAt(platformSettings, "payments"), "payouts"), "schedule"), "interval") ||
            "unknown";
        platformPayoutMinimum =
            numberAt(
                objectAt(objectAt(objectAt(platformSettings, "payments"), "payouts"), "minimum_balance_by_currency"),
                "eur",
            ) ?? 0;
        platformRequiredMinimum = Math.max(
            platformControl.required_minimum_amount,
            platformControl.provider_minimum_amount,
        );
        await resolveProviderException("platform-payout-settings-unavailable");
        if (platformPayoutInterval !== protectedPlatformPayoutInterval) {
            exceptions++;
            await upsertProviderException("platform-payout-schedule-drift", {
                exception_type: "platform_payout_schedule_drift",
                severity: "critical",
                status: "open",
                message:
                    "Stripe platform payout schedule is not the protected automatic schedule; new protected payments are blocked",
                details: { platformPayoutInterval, providerSnapshot: platformSettings },
            });
        } else {
            await resolveProviderException("platform-payout-schedule-drift");
        }
        if (platformPayoutMinimum < platformRequiredMinimum) {
            exceptions++;
            await upsertProviderException("platform-payout-minimum-drift", {
                exception_type: "platform_payout_minimum_drift",
                severity: "critical",
                status: "open",
                message: "Stripe platform minimum balance is below the monotonic protected liability requirement",
                details: {
                    platformPayoutMinimum,
                    platformRequiredMinimum,
                    liabilityRevision: platformControl.liability_revision,
                },
            });
        } else {
            await resolveProviderException("platform-payout-minimum-drift");
        }
    } catch (error) {
        exceptions++;
        await upsertProviderException("platform-payout-settings-unavailable", {
            exception_type: "platform_payout_settings_unavailable",
            severity: "critical",
            status: "open",
            message: errorMessage(error),
            details: {},
        }).catch(() => null);
    }
    // Keep one unit available for every later recovery queue. A permanent
    // webhook backlog must never starve money-operation recovery, provider
    // payment reconciliation, or payout-hold enforcement.
    const eventBudget = Math.max(1, remainingWorkBudget - 4);
    const events =
        remainingWorkBudget > 0 ? await callRpcRows<JsonRecord>("claim_stripe_events", { p_limit: eventBudget }) : [];
    remainingWorkBudget -= events.length;
    for (const event of events) {
        scanned++;
        try {
            const changed = await processStripeEvent(event);
            if (changed) {
                repaired++;
            }
            await updateRow("stripe_events", Number(event.id), {
                processing_status: changed ? "processed" : "ignored",
                processing_started_at: null,
                processed_at: new Date().toISOString(),
                last_error: null,
            });
        } catch (error) {
            exceptions++;
            await updateRow("stripe_events", Number(event.id), {
                processing_status: Number(event.attempt_count ?? 0) >= 5 ? "manual_review" : "failed",
                processing_started_at: null,
                last_error: errorMessage(error),
            });
        }
    }

    const operationBudget = Math.max(1, remainingWorkBudget - 3);
    const claimedOperations =
        remainingWorkBudget > 0
            ? await callRpcRows<FinancialOperationRow>("claim_financial_operations", { p_limit: operationBudget })
            : [];
    remainingWorkBudget -= claimedOperations.length;
    for (const operation of claimedOperations) {
        scanned++;
        try {
            if (await processClaimedFinancialOperation(operation)) {
                repaired++;
            }
        } catch (error) {
            exceptions++;
            if (operation.payment_id) {
                await moveOperationToManualReview(
                    operation.payment_id,
                    operation,
                    error,
                    "financial_operation_recovery_ambiguous",
                );
            } else {
                await updateFinancialOperation(operation.id, {
                    status: "manual_review",
                    last_error: errorMessage(error),
                }).catch(() => null);
                await insertRow<JsonRecord>("provider_exceptions", "id", {
                    operation_id: operation.id,
                    exception_type: "account_or_platform_operation_recovery_ambiguous",
                    severity: "critical",
                    message: errorMessage(error),
                    details: { businessKey: operation.business_key, operationType: operation.operation_type },
                }).catch(() => null);
            }
        }
    }
    const stalePaymentBudget = Math.max(1, remainingWorkBudget - 2);
    const stalePayments =
        remainingWorkBudget > 0
            ? await listRows<ConnectPaymentRow>(
                  "payments?payment_status=in.(created,requires_action,processing,succeeded)" +
                      `&select=${encodeURIComponent(paymentSelect)}` +
                      `&order=last_provider_sync_at.asc.nullsfirst,updated_at.asc&limit=${stalePaymentBudget}`,
              )
            : [];
    remainingWorkBudget -= stalePayments.length;
    for (const payment of stalePayments) {
        scanned++;
        try {
            const before = `${payment.payment_status}:${payment.stripe_charge_id ?? ""}:${payment.refunded_amount}`;
            const reconciled = await reconcilePayment(payment);
            const after = `${reconciled.payment_status}:${reconciled.stripe_charge_id ?? ""}:${reconciled.refunded_amount}`;
            if (before !== after) {
                repaired++;
            }
        } catch (error) {
            exceptions++;
            await markPaymentManualReview(payment.id, "stale provider payment reconciliation failed", {
                error: errorMessage(error),
            }).catch(() => null);
        }
    }
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
        scanned++;
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
        scanned++;
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
    run =
        (await updateRow<JsonRecord>(
            "reconciliation_runs",
            Number(run.id),
            {
                status: exceptions ? "manual_review" : "succeeded",
                scanned_count: scanned,
                repaired_count: repaired,
                exception_count: exceptions,
                details: {
                    stripeApiVersion: stripeV1ApiVersion,
                    processedStripeEvents: events.length,
                    recoveredFinancialOperations: claimedOperations.length,
                    reconciledStalePayments: stalePayments.length,
                    reconciledSellerRiskAccounts: sellerRiskAccounts.length,
                    reconciledManualPayoutHolds: manualPayoutHoldAccounts.length,
                    platformPayoutInterval,
                    platformPayoutMinimum,
                    platformRequiredMinimum,
                    workBudgetLimit: limit,
                    workBudgetConsumed: limit - remainingWorkBudget,
                },
                finished_at: new Date().toISOString(),
            },
            "*",
        )) ?? run;
    return json(await publicReconciliationRun(run, limit, `commerce:${runKey}`));
}

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
        const scope = optionalOperationString(operation, "scope");
        const stripeAccountId = optionalOperationString(operation, "stripeAccountId");
        const cmsUserId = optionalOperationString(operation, "cmsUserId");
        if (cmsUserId && stripeAccountId) {
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
                await sellerPayoutHoldRpc("complete_seller_payout_hold", {
                    p_seller_cms_user_id: cmsUserId,
                    p_owner: owner,
                    p_expected_risk_revision: account.risk_revision,
                    p_applied_minimum_amount: account.provider_hold_minimum_amount,
                    p_succeeded: false,
                    p_error: errorMessage(error),
                }).catch(() => null);
                throw error;
            }
            if (operation.business_key.startsWith("seller-risk-hold:")) {
                const requiredHold = account.outstanding_debt_amount + account.financial_exposure_amount;
                let protectedByHold: boolean;
                if (requiredHold > 0) {
                    protectedByHold = await applyClaimedSellerRecoveryPayoutHold(cmsUserId, owner, claim);
                } else {
                    let readyToRestore = false;
                    if (!account.manual_payout_hold_started_at || !account.manual_payout_hold_restore_settings) {
                        const currentMinimum =
                            numberAt(
                                objectAt(
                                    objectAt(objectAt(current, "payments"), "payouts"),
                                    "minimum_balance_by_currency",
                                ),
                                "eur",
                            ) ?? 0;
                        const completed = await sellerPayoutHoldRpc("complete_seller_payout_hold", {
                            p_seller_cms_user_id: cmsUserId,
                            p_owner: owner,
                            p_expected_risk_revision: account.risk_revision,
                            p_applied_minimum_amount: currentMinimum,
                            p_succeeded: true,
                            p_error: null,
                            p_restore_settings: objectAt(operation.request, "restoreSettings"),
                        });
                        if (completed.accepted !== true) {
                            throw new Error("seller payout hold recovery lease was superseded");
                        }
                        if (completed.needsReapply === true) {
                            protectedByHold = await applyClaimedSellerRecoveryPayoutHold(cmsUserId, owner, {
                                claimed: true,
                                account: objectAt(completed, "account"),
                            });
                        } else {
                            readyToRestore = true;
                        }
                    } else {
                        const cancelled = await sellerPayoutHoldRpc("cancel_seller_payout_configuration", {
                            p_seller_cms_user_id: cmsUserId,
                            p_owner: owner,
                            p_expected_risk_revision: account.risk_revision,
                        });
                        if (cancelled.accepted !== true) {
                            throw new Error("seller payout hold recovery lease was superseded");
                        }
                        if (cancelled.superseded === true) {
                            protectedByHold = await applyClaimedSellerRecoveryPayoutHold(cmsUserId, owner, {
                                claimed: true,
                                account: objectAt(cancelled, "account"),
                            });
                        } else {
                            readyToRestore = true;
                        }
                    }
                    if (readyToRestore) {
                        protectedByHold = await restoreSellerAutomaticPayoutSchedule(cmsUserId);
                    }
                }
                if (!protectedByHold) {
                    throw new Error("seller payout hold recovery requires finance review");
                }
            } else {
                if (!balanceSettingsMatchRequest(current, operation.request)) {
                    const cancelled = await sellerPayoutHoldRpc("cancel_seller_payout_configuration", {
                        p_seller_cms_user_id: cmsUserId,
                        p_owner: owner,
                        p_expected_risk_revision: account.risk_revision,
                    }).catch(() => null);
                    if (cancelled?.accepted === true && cancelled.superseded === true) {
                        await applyClaimedSellerRecoveryPayoutHold(cmsUserId, owner, cancelled).catch(() => false);
                    }
                    throw new Error("payout schedule operation does not match current Stripe Balance Settings");
                }
                const expectedRiskRevision = numberAt(operation.request, "riskRevision");
                if (!Number.isSafeInteger(expectedRiskRevision) || expectedRiskRevision! < 0) {
                    await applyClaimedSellerRecoveryPayoutHold(cmsUserId, owner, claim);
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
                        await applyClaimedSellerRecoveryPayoutHold(cmsUserId, owner, finalized);
                    }
                    throw new Error("payout schedule operation was superseded by seller financial risk");
                }
            }
            const finalProvider = await retrieveConnectedBalanceSettings(stripeAccountId);
            await updateFinancialOperation(operation.id, {
                status: "succeeded",
                response: finalProvider,
                last_error: null,
                completed_at: new Date().toISOString(),
            });
            return true;
        }
        const current = scope === "platform" ? await retrievePlatformBalanceSettings() : null;
        if (!current || !balanceSettingsMatchRequest(current, operation.request)) {
            throw new Error("payout schedule operation does not match current Stripe Balance Settings");
        }
        await updateFinancialOperation(operation.id, {
            status: "succeeded",
            response: current,
            last_error: null,
            completed_at: new Date().toISOString(),
        });
        return true;
    }
    if (!operation.payment_id) {
        return false;
    }
    const usesRecoveryContext =
        operation.operation_type === "transfer_create" ||
        operation.operation_type === "transfer_reversal_create" ||
        operation.operation_type === "refund_create";
    const rawRecoveryRequestId = operation.request.recoveryRequestId;
    const recoveryContext = usesRecoveryContext
        ? await readFinancialOperationRecoveryContext(
              operation.payment_id,
              operation.id,
              typeof rawRecoveryRequestId === "string" ? rawRecoveryRequestId : null,
          )
        : null;
    const payment = recoveryContext
        ? (recoveryContext.payment as unknown as ConnectPaymentRow | null)
        : await requiredPayment(operation.payment_id);
    if (!payment) {
        throw new HttpError(404, "payment not found");
    }
    if (operation.operation_type === "payment_intent_create") {
        let intent: StripePaymentIntent;
        if (operation.stripe_object_id) {
            intent = await retrievePaymentIntent(operation.stripe_object_id);
        } else if (payment.stripe_payment_intent_id) {
            intent = await retrievePaymentIntent(payment.stripe_payment_intent_id);
        } else {
            const operationAge = Date.now() - Date.parse(operation.created_at);
            if (!Number.isFinite(operationAge) || operationAge >= 23 * 60 * 60 * 1000) {
                throw new Error("PaymentIntent recovery exceeded the Stripe idempotency safety window");
            }
            intent = await createStripePaymentIntent(payment);
        }
        const applied = await applyPaymentIntent(payment, intent, {
            actorKind: "reconciliation",
            actorId: "financial-operation-recovery",
        });
        await updateFinancialOperation(operation.id, {
            status: applied.settlement_status === "manual_review" ? "manual_review" : "succeeded",
            stripe_object_id: intent.id,
            response: intent,
            last_error: applied.settlement_status === "manual_review" ? applied.manual_review_reason : null,
            completed_at: new Date().toISOString(),
        });
        return true;
    }
    if (operation.operation_type === "payment_intent_cancel") {
        await executePaymentIntentCancellation(
            payment,
            operation,
            "reconciliation",
            requiredOperationString(operation, "cancellationRequestId"),
        );
        return true;
    }
    if (operation.operation_type === "transfer_create") {
        const localTransfer = recoveryContext?.transfer as unknown as TransferRow | null;
        if (localTransfer?.stripe_transfer_id && localTransfer.status === "succeeded") {
            await updateFinancialOperation(operation.id, {
                status: "succeeded",
                stripe_object_id: localTransfer.stripe_transfer_id,
                response: localTransfer.provider_snapshot ?? {},
                last_error: null,
                completed_at: new Date().toISOString(),
            });
            return true;
        }
        await executeSettlementRelease(
            payment,
            requiredOperationString(operation, "releaseAuthorizationId"),
            requiredReleaseKind(requiredOperationString(operation, "releaseKind")),
            requiredOperationInteger(operation, "amount"),
            requiredOperationString(operation, "currency"),
        );
        return true;
    }
    if (operation.operation_type === "transfer_reversal_create") {
        const localReversal = recoveryContext?.transfer_reversal;
        if (localReversal?.stripe_transfer_reversal_id && localReversal.status === "succeeded") {
            await updateFinancialOperation(operation.id, {
                status: "succeeded",
                stripe_object_id: localReversal.stripe_transfer_reversal_id,
                response: isRecord(localReversal.provider_snapshot) ? localReversal.provider_snapshot : {},
                last_error: null,
                completed_at: new Date().toISOString(),
            });
            return true;
        }
        const recoveryRequestId = requiredOperationString(operation, "recoveryRequestId");
        const recovery = recoveryContext?.transfer_recovery as unknown as TransferRecoveryRow | null;
        if (!recovery) {
            throw new Error(`operation ${operation.id} has no Transfer recovery parent`);
        }
        await executeTransferReversal(payment, recoveryRequestId, recovery.requested_amount, recovery.reason);
        return true;
    }
    if (operation.operation_type === "refund_create") {
        const localRefund = recoveryContext?.refund as unknown as RefundRow | null;
        if (localRefund?.stripe_refund_id && ["pending", "succeeded"].includes(localRefund.status)) {
            await updateFinancialOperation(operation.id, {
                status: localRefund.status === "succeeded" ? "succeeded" : "processing",
                stripe_object_id: localRefund.stripe_refund_id,
                response: localRefund.provider_snapshot ?? {},
                last_error: null,
                completed_at: localRefund.status === "succeeded" ? new Date().toISOString() : null,
            });
            await enqueueCommerceRefundProjection(localRefund.id);
            return true;
        }
        await executeRefund(
            payment,
            requiredOperationString(operation, "refundRequestId"),
            optionalOperationInteger(operation, "commerceRefundRequestId"),
            requiredOperationInteger(operation, "amount"),
            requiredOperationInteger(operation, "requiredReversalAmount"),
            requiredOperationInteger(operation, "sellerEntitlementReductionAmount"),
            requiredOperationInteger(operation, "authorizedSellerAmount"),
            optionalOperationString(operation, "reason"),
        );
        return true;
    }
    return false;
}

async function publicReconciliationRun(run: JsonRecord, limit: number, projectionOwner: string): Promise<JsonRecord> {
    const operationReads = await readReconciliationOperations(limit);
    const operations = operationReads.map((read) =>
        publicFinancialOperation(
            read.operation as unknown as FinancialOperationRow,
            read.client_reference_id === null
                ? null
                : {
                      client_reference_id: read.client_reference_id,
                      currency: read.payment_currency ?? "",
                  },
        ),
    );
    const claimedReads = await claimReconciliationProjectionBatch(projectionOwner, limit);
    const claimedPublic = claimedReads.map((read) => {
        const projection = read.projection as unknown as CommerceProjectionOutboxRow;
        const lease = {
            projectionId: projection.id,
            projectionClaimToken: projection.claim_token,
            projectionAttemptCount: projection.attempt_count,
            recoveryKey: projection.recovery_key,
            causalSequence: projection.causal_sequence,
        };
        if (projection.projection_kind === "payment") {
            if (!read.payment) {
                throw new HttpError(404, "payment not found");
            }
            const payment = read.payment as unknown as ConnectPaymentRow;
            return {
                kind: "payment",
                value: {
                    ...publicPayment(payment),
                    providerEventId: projection.projection_key,
                    ...lease,
                },
            };
        }
        if (projection.projection_kind === "dispute") {
            if (!read.dispute) {
                throw new Error(`projection ${projection.id} has no Stripe dispute`);
            }
            if (read.dispute_client_reference_id === null) {
                throw new HttpError(404, "payment not found");
            }
            const dispute = read.dispute as unknown as StripeDisputeRow;
            return {
                kind: "dispute",
                value: {
                    ...projectPublicDisputeWithContext(dispute, {
                        clientReferenceId: read.dispute_client_reference_id,
                        staged: read.staged_evidence,
                        evidenceSubmissionCount: Number(read.evidence_submission_count),
                        pendingApproval: read.pending_approval,
                    }),
                    providerEventId: projection.projection_key,
                    ...lease,
                },
            };
        }
        if (!projection.operation_id) {
            throw new Error(`projection ${projection.id} has no financial operation id`);
        }
        if (!read.financial_operation) {
            throw new Error(`projection ${projection.id} has no financial operation`);
        }
        const operation = read.financial_operation as unknown as FinancialOperationRow;
        const payment = read.operation_payment as unknown as ConnectPaymentRow | null;
        const publicOperation = publicCommerceOperation(publicFinancialOperation(operation, payment));
        if (!publicOperation) {
            return null;
        }
        if (projection.projection_kind === "refund") {
            const payload = projection.projection_payload ?? {};
            return {
                kind: "operation",
                value: {
                    ...publicOperation,
                    providerEventId: projection.projection_key,
                    status: stringAt(payload, "status") || publicOperation.status,
                    refundRequestId: payload.refundRequestId ?? publicOperation.refundRequestId,
                    commerceRefundRequestId: payload.commerceRefundRequestId ?? publicOperation.commerceRefundRequestId,
                    providerSnapshot: objectAt(payload, "providerSnapshot"),
                    occurredAt: payload.occurredAt ?? publicOperation.occurredAt,
                    ...lease,
                },
            };
        }
        return {
            kind: "operation",
            value: {
                ...publicOperation,
                providerEventId: projection.projection_key,
                ...lease,
            },
        };
    });
    const paymentProjections = claimedPublic
        .filter((entry): entry is { kind: string; value: JsonRecord } => entry?.kind === "payment")
        .map((entry) => entry.value);
    const commerceOperations = claimedPublic
        .filter((entry): entry is { kind: string; value: JsonRecord } => entry?.kind === "operation")
        .map((entry) => entry.value);
    const disputeProjections = claimedPublic
        .filter((entry): entry is { kind: string; value: JsonRecord } => entry?.kind === "dispute")
        .map((entry) => entry.value);
    return {
        runId: run.id,
        runKey: run.run_key,
        status: run.status,
        scannedCount: run.scanned_count,
        repairedCount: run.repaired_count,
        exceptionCount: run.exception_count,
        details: run.details,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        payments: paymentProjections,
        operations,
        commerceOperations,
        disputes: disputeProjections,
    };
}

function publicCommerceOperation(operation: JsonRecord): JsonRecord | null {
    const rawType = stringAt(operation, "operationType");
    const operationType =
        rawType === "transfer_create"
            ? "transfer"
            : rawType === "transfer_reversal_create"
              ? "reversal"
              : rawType === "refund_create"
                ? "refund"
                : null;
    if (!operationType) {
        return null;
    }
    return stripUndefined({
        orderPublicId: operation.clientReferenceId ?? null,
        paymentId: operation.paymentId ?? null,
        providerPaymentId: operation.providerPaymentId ?? null,
        providerOperationId: operation.providerOperationId,
        providerEventId: operation.providerEventId,
        operationType,
        status: operation.status,
        amount: operation.amount,
        currency: operation.currency,
        releaseAuthorizationId: operation.releaseAuthorizationId ?? undefined,
        refundRequestId: operation.refundRequestId ?? undefined,
        commerceRefundRequestId: operation.commerceRefundRequestId ?? undefined,
        providerSnapshot: operation.response ?? {},
        occurredAt: operation.occurredAt,
        createdAt: operation.createdAt,
        updatedAt: operation.updatedAt,
    });
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

async function enforceSellerRecoveryPayoutHold(userId: string): Promise<boolean> {
    const owner = crypto.randomUUID();
    const claim = await sellerPayoutHoldRpc("claim_seller_payout_hold", {
        p_seller_cms_user_id: userId,
        p_owner: owner,
        p_require_risk: true,
    });
    if (claim.claimed !== true) {
        return false;
    }
    return await applyClaimedSellerRecoveryPayoutHold(userId, owner, claim);
}

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
            const currentPayments = objectAt(current, "payments");
            const currentSchedule = objectAt(objectAt(currentPayments, "payouts"), "schedule");
            const currentMinimum =
                numberAt(objectAt(objectAt(currentPayments, "payouts"), "minimum_balance_by_currency"), "eur") ?? 0;
            const currentInterval = stringAt(currentSchedule, "interval");
            if (!["manual", "daily", "weekly", "monthly"].includes(currentInterval)) {
                throw new Error("Seller payout baseline has an unsupported interval");
            }
            const weeklyPayoutDays = stringArrayAt(currentSchedule, "weekly_payout_days");
            const monthlyPayoutDays = arrayAt(currentSchedule, "monthly_payout_days").filter((value) =>
                Number.isSafeInteger(value),
            );
            if (
                (currentInterval === "weekly" && weeklyPayoutDays.length === 0) ||
                (currentInterval === "monthly" && monthlyPayoutDays.length === 0)
            ) {
                throw new Error("Seller payout baseline is missing its scheduled payout days");
            }
            const restoreSettings = account.manual_payout_hold_restore_settings ?? {
                interval: currentInterval,
                ...(currentInterval === "weekly" ? { weeklyPayoutDays } : {}),
                ...(currentInterval === "monthly" ? { monthlyPayoutDays } : {}),
                minimumBalanceEur: currentMinimum,
                debitNegativeBalances: currentPayments.debit_negative_balances === true,
                ...(Number.isSafeInteger(objectAt(currentPayments, "settlement_timing").delay_days_override)
                    ? { delayDaysOverride: objectAt(currentPayments, "settlement_timing").delay_days_override }
                    : {}),
            };
            appliedMinimum = Math.max(requiredHold, account.provider_hold_minimum_amount, currentMinimum);
            const holdRequest = {
                interval: "manual",
                minimumBalanceEur: appliedMinimum,
                debitNegativeBalances: true,
                reason: "Seller recovery exposure hold",
            };
            operation = await reserveAccountFinancialOperation(userId, {
                businessKey: holdKey,
                operationType: "payout_schedule_update",
                request: {
                    cmsUserId: userId,
                    stripeAccountId: account.stripe_account_id,
                    restoreSettings,
                    ...holdRequest,
                },
            });
            let provider = current;
            if (!balanceSettingsMatchRequest(current, holdRequest)) {
                await updateFinancialOperation(operation.id, {
                    status: "processing",
                    claimed_at: new Date().toISOString(),
                    attempt_count: operation.attempt_count + 1,
                });
                provider = await updateBalanceSettings(
                    account.stripe_account_id,
                    holdRequest,
                    await stableStripeIdempotencyKey("payout-schedule", holdKey),
                );
            }
            if (!balanceSettingsMatchRequest(provider, holdRequest)) {
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
                p_restore_settings: restoreSettings,
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

    await sellerPayoutHoldRpc("complete_seller_payout_hold", {
        p_seller_cms_user_id: userId,
        p_owner: owner,
        p_expected_risk_revision: sellerRiskAccount(claim).risk_revision,
        p_applied_minimum_amount: sellerRiskAccount(claim).provider_hold_minimum_amount,
        p_succeeded: false,
        p_error: "Seller payout hold changed repeatedly during provider synchronization",
    }).catch(() => null);
    return false;
}

async function restoreSellerAutomaticPayoutSchedule(userId: string): Promise<boolean> {
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
        if (!account.manual_payout_hold_started_at || !account.manual_payout_hold_restore_settings) {
            throw new Error("Seller payout hold restoration snapshot is unavailable");
        }
        const snapshot = account.manual_payout_hold_restore_settings;
        const restoreSettingKeys = new Set([
            "interval",
            "weeklyPayoutDays",
            "monthlyPayoutDays",
            "minimumBalanceEur",
            "delayDaysOverride",
            "debitNegativeBalances",
        ]);
        if (Object.keys(snapshot).some((key) => !restoreSettingKeys.has(key))) {
            throw new Error("Seller payout hold restoration snapshot contains unsupported settings");
        }
        const interval = stringAt(snapshot, "interval");
        const minimumBalanceEur = numberAt(snapshot, "minimumBalanceEur");
        const weeklyPayoutDays = stringArrayAt(snapshot, "weeklyPayoutDays");
        const monthlyPayoutDays = arrayAt(snapshot, "monthlyPayoutDays").filter((value) => Number.isSafeInteger(value));
        if (
            !["manual", "daily", "weekly", "monthly"].includes(interval) ||
            !Number.isSafeInteger(minimumBalanceEur) ||
            minimumBalanceEur! < 0 ||
            (interval === "weekly" && weeklyPayoutDays.length === 0) ||
            (interval === "monthly" && monthlyPayoutDays.length === 0) ||
            (interval !== "weekly" && weeklyPayoutDays.length > 0) ||
            (interval !== "monthly" && monthlyPayoutDays.length > 0)
        ) {
            throw new Error("Seller payout hold restoration snapshot is invalid");
        }
        const restoreRequest: JsonRecord = {
            interval,
            minimumBalanceEur,
            ...(interval === "weekly" ? { weeklyPayoutDays } : {}),
            ...(interval === "monthly" ? { monthlyPayoutDays } : {}),
            ...(typeof snapshot.debitNegativeBalances === "boolean"
                ? { debitNegativeBalances: snapshot.debitNegativeBalances }
                : {}),
            ...(Number.isSafeInteger(snapshot.delayDaysOverride)
                ? { delayDaysOverride: snapshot.delayDaysOverride }
                : {}),
            reason: "Seller recovery exposure cleared",
        };
        const restoreKey = `seller-risk-restore:${userId}:${account.risk_revision}:${account.manual_payout_hold_started_at}`;
        operation = await reserveAccountFinancialOperation(userId, {
            businessKey: restoreKey,
            operationType: "payout_schedule_update",
            request: {
                cmsUserId: userId,
                stripeAccountId: account.stripe_account_id,
                riskRevision: account.risk_revision,
                manualPayoutHoldStartedAt: account.manual_payout_hold_started_at,
                ...restoreRequest,
            },
        });
        let provider = await retrieveConnectedBalanceSettings(account.stripe_account_id);
        if (!balanceSettingsMatchRequest(provider, restoreRequest)) {
            await updateFinancialOperation(operation.id, {
                status: "processing",
                claimed_at: new Date().toISOString(),
                attempt_count: operation.attempt_count + 1,
            });
            try {
                provider = await updateBalanceSettings(
                    account.stripe_account_id,
                    restoreRequest,
                    await stableStripeIdempotencyKey("payout-schedule", restoreKey),
                );
            } catch (updateError) {
                const recovered = await retrieveConnectedBalanceSettings(account.stripe_account_id).catch(() => null);
                if (!recovered || !balanceSettingsMatchRequest(recovered, restoreRequest)) {
                    throw updateError;
                }
                provider = recovered;
            }
        }
        if (!balanceSettingsMatchRequest(provider, restoreRequest)) {
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
            p_interval: interval,
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
