import {
    defaultCurrency,
    protectedPlatformPayoutInterval,
    requiredEnv,
    stripeLivemode,
    stripeV1ApiVersion,
    stripeV2ApiVersion,
    stripeWebhookMaximumBytes,
    stripeWebhookToleranceSeconds,
} from "./shared/runtime.ts";
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
import {
    getAccountRow,
    getAccountRowByStripeAccountId,
    getMarketplaceTermsAcceptance,
    updateAccountRow,
} from "./db/repositories/accounts.ts";
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
    reservePlatformFinancialOperation,
    updateFinancialOperation,
} from "./db/repositories/financial-operations.ts";
import {
    sumConfirmedRecoveryAmount,
    sumSucceededAmounts,
    sumSucceededField,
    sumSucceededRefundSellerRecovery,
    sumSucceededTransferReversalAmounts,
} from "./db/repositories/ledger.ts";
import {
    getPaymentByClientReference,
    getPaymentRow,
    reserveProtectedPayment,
    updatePayment,
} from "./db/repositories/payments.ts";
import {
    markPaymentManualReview,
    platformPayoutControlRpc,
    sellerPayoutHoldRpc,
} from "./db/repositories/payout-controls.ts";
import { reserveTransferRecovery } from "./db/repositories/transfer-recovery.ts";
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
import {
    transferRecoverySelect,
    transferReversalSelect,
    transferSelect,
    type ReservedTransferRecovery,
    type TransferRecoveryRow,
    type TransferReversalRow,
    type TransferRow,
} from "./db/records/transfers.ts";
import {
    claimReconciliationProjectionBatch,
    readFinancialOperationRecoveryContext,
    readPaymentReconciliationLocalContext,
    readPaymentReconciliationLedger,
    readProviderTransferReconciliationContext,
    readReconciliationOperations,
} from "./db/reconciliation.ts";
import {
    bankPayoutsStatus,
    sellerCanAcceptHeldPayments,
    stripeTransfersStatus,
} from "./domain/accounts/eligibility.ts";
import { balanceSettingsMatchRequest, publicBalanceSettings } from "./domain/accounts/payout-settings.ts";
import { accountPatchFromStripe } from "./domain/accounts/provider-projection.ts";
import { publicSellerProviderRisk } from "./domain/accounts/risk-presentation.ts";
import { publicPayment, publicPaymentWithClientSecret } from "./domain/payments/presentation.ts";
import { chargeId } from "./domain/payments/provider-state.ts";
import { publicFinancialOperation } from "./domain/admin/financial-operation.ts";
import { projectPublicDisputeWithContext } from "./domain/disputes/presentation.ts";
import { normalizeProtectedRefundOperation, publicRefund } from "./domain/refunds/presentation.ts";
import { publicReversal, publicTransferRecovery } from "./domain/transfers/presentation.ts";
import { loadPublicTransferRecovery } from "./domain/transfers/recovery-read.ts";
import { requireCmsRequest, requireDashboardAdmin } from "./http/auth.ts";
import {
    assertAllowedKeys,
    marketplaceTermsExpectationFromBody,
    optionalBoolean,
    optionalCurrency,
    optionalNonNegativeInteger,
    optionalPositiveInteger,
    optionalText,
    readJsonObject,
    requiredHash,
    requiredInteger,
    requiredString,
    validBusinessType,
} from "./http/body.ts";
import { HttpError } from "./http/errors.ts";
import { optionalMonthlyPayoutDays, optionalWeeklyPayoutDays, requiredPayoutInterval } from "./http/payouts.ts";
import { requiredQueryInteger, requiredQueryText, requiredReleaseKind } from "./http/query.ts";
import { json } from "./http/responses.ts";
import { serveStripeConnect } from "./http/router.ts";
import {
    retrieveConnectedBalanceSettings,
    retrievePlatformBalanceSettings,
    updateBalanceSettings,
} from "./provider/accounts/balances.ts";
import { retrieveAccount } from "./provider/accounts/lifecycle.ts";
import {
    closeStripeDispute,
    listStripeDisputesByCharge,
    retrieveStripeDispute,
    updateStripeDisputeEvidence,
    uploadStripeDisputeEvidenceFile,
} from "./provider/disputes.ts";
import {
    createStripePaymentIntent,
    retrievePaymentIntent,
    retrieveStripeBalanceTransaction,
} from "./provider/payments.ts";
import { retrieveStripePayout } from "./provider/payouts.ts";
import {
    createStripeRefund,
    listStripeRefundsByCharge,
    retrieveStripeRefund,
    retrieveStripeRefundSnapshot,
} from "./provider/refunds.ts";
import {
    createStripeTransferReversal,
    listStripeTransferReversals,
    listStripeTransfersByGroup,
    retrieveStripeTransferReversal,
} from "./provider/transfers.ts";
import type { StripeBalanceSettings, StripeDispute, StripePaymentIntent, StripeRefund } from "./provider/types.ts";
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
import { getStripeDispute, listStripeDisputes } from "./routes/disputes/dashboard.ts";
import { requestPaymentIntentCancellation } from "./routes/payments/cancellation.ts";
import { getProviderPayment, listProviderPayments } from "./routes/payments/dashboard.ts";
import { createProtectedPaymentRoutes } from "./routes/payments/protected.ts";
import { createRequestSettlementRelease } from "./routes/payments/settlement-release.ts";
import { createRequestTransferReversal } from "./routes/payments/transfer-reversal.ts";
import { getProviderRefund, listProviderRefunds } from "./routes/refunds/dashboard.ts";
import { connectConfig, health } from "./routes/system.ts";
import { bytesToHex, digest, safeEqual, stableStripeIdempotencyKey } from "./shared/crypto.ts";
import {
    arrayAt,
    errorMessage,
    isRecord,
    jsonEqual,
    numberAt,
    objectAt,
    recordArrayAt,
    requiredRecordString,
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
import { executePaymentIntentCancellation } from "./workflows/payments/cancellation.ts";
import { createProtectedPaymentWorkflow } from "./workflows/payments/creation/workflow.ts";
import { createSettlementReleaseWorkflow } from "./workflows/payments/settlement-release.ts";
import { createTransferReversalWorkflow } from "./workflows/payments/transfer-reversal/workflow.ts";
import {
    applyPaymentIntent,
    paymentClientSecret,
    quarantineProviderPaymentTruth,
    syncPayment,
} from "./workflows/payments/projection.ts";

const executeSettlementRelease = createSettlementReleaseWorkflow({
    reconcilePayment,
    authorizedSellerAmountAfterRefunds,
    moveOperationToManualReview,
});
const requestSettlementRelease = createRequestSettlementRelease({
    executeSettlementRelease,
    requiredPayment,
});
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
    requiredPayment,
});
const requestTransferReversal = createRequestTransferReversal({ executeTransferReversal, requiredPayment });

serveStripeConnect({
    ingestPlatformWebhook: (request) => ingestStripeWebhook(request, "platform"),
    ingestConnectWebhook: (request) => ingestStripeWebhook(request, "connect"),
    ingestConnectV2Webhook: (request) => ingestStripeWebhook(request, "connect_v2"),
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

async function configurePlatformPayoutProtection(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, [
        "platformPayoutControlChangeId",
        "minimumBalanceEur",
        "delayDaysOverride",
        "debitNegativeBalances",
        "reason",
        "liabilityRevision",
        "decreaseAuthorizationId",
    ]);
    const changeId = requiredString(body, "platformPayoutControlChangeId", 200);
    const minimumBalanceEur = optionalNonNegativeInteger(body, "minimumBalanceEur");
    const liabilityRevision = requiredInteger(body, "liabilityRevision");
    if (!Number.isSafeInteger(liabilityRevision) || liabilityRevision < 0) {
        throw new HttpError(400, "liabilityRevision must be a non-negative safe integer");
    }
    const decreaseAuthorizationId = optionalText(body, "decreaseAuthorizationId", 64);
    if (
        decreaseAuthorizationId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decreaseAuthorizationId)
    ) {
        throw new HttpError(400, "decreaseAuthorizationId must be a UUID");
    }
    const delayDaysOverride = optionalNonNegativeInteger(body, "delayDaysOverride");
    const debitNegativeBalances = optionalBoolean(body, "debitNegativeBalances");
    const reason = optionalText(body, "reason", 500);
    if (delayDaysOverride !== null && delayDaysOverride > 31) {
        throw new HttpError(400, "delayDaysOverride must be between zero and 31");
    }
    const owner = crypto.randomUUID();
    let claim = await platformPayoutControlRpc("claim_platform_payout_protection", {
        p_owner: owner,
        p_required_minimum_amount: minimumBalanceEur ?? 0,
        p_liability_revision: liabilityRevision,
        p_decrease_authorization_id: decreaseAuthorizationId,
    });
    if (claim.claimed !== true) {
        throw new HttpError(
            409,
            "platform payout protection is already being synchronized; the higher requirement was recorded",
        );
    }
    let operation: FinancialOperationRow | null = null;
    let appliedMinimum = 0;
    let appliedDecreaseAuthorizationId: string | null = null;
    try {
        for (let attempt = 0; attempt < 5; attempt++) {
            const control = platformPayoutControl(claim);
            appliedDecreaseAuthorizationId = control.decrease_authorization_id;
            const current = await retrievePlatformBalanceSettings();
            const currentMinimum =
                numberAt(
                    objectAt(objectAt(objectAt(current, "payments"), "payouts"), "minimum_balance_by_currency"),
                    "eur",
                ) ?? 0;
            appliedMinimum = control.decrease_authorization_id
                ? control.required_minimum_amount
                : Math.max(control.required_minimum_amount, control.provider_minimum_amount, currentMinimum);
            const operationRequest = stripUndefined({
                scope: "platform",
                interval: protectedPlatformPayoutInterval,
                minimumBalanceEur: appliedMinimum,
                delayDaysOverride: delayDaysOverride ?? undefined,
                debitNegativeBalances: debitNegativeBalances ?? undefined,
                reason: reason ?? undefined,
                commerceLiabilityRevision: control.liability_revision,
                commerceRequestedDecreaseAuthorizationId: decreaseAuthorizationId ?? undefined,
                commerceAppliedDecreaseAuthorizationId: appliedDecreaseAuthorizationId ?? undefined,
            });
            const requestHash = await digest(JSON.stringify(operationRequest));
            const businessKey = [
                "platform-payout-protection",
                control.liability_revision,
                appliedMinimum,
                requestHash,
            ].join(":");
            operation = await reservePlatformFinancialOperation({
                businessKey,
                operationType: "payout_schedule_update",
                request: operationRequest,
            });
            let provider = current;
            if (!balanceSettingsMatchRequest(current, operationRequest)) {
                await updateFinancialOperation(operation.id, {
                    status: "processing",
                    claimed_at: new Date().toISOString(),
                    attempt_count: operation.attempt_count + 1,
                });
                provider = await updateBalanceSettings(
                    null,
                    operationRequest,
                    await stableStripeIdempotencyKey("platform-payout-protection", businessKey),
                );
            }
            if (!balanceSettingsMatchRequest(provider, operationRequest)) {
                throw new Error("Stripe did not confirm the required platform payout protection");
            }
            if (operation.status !== "succeeded" || provider !== current) {
                await updateFinancialOperation(operation.id, {
                    status: "succeeded",
                    response: provider,
                    last_error: null,
                    completed_at: new Date().toISOString(),
                });
            }
            const completed = await platformPayoutControlRpc("complete_platform_payout_protection", {
                p_owner: owner,
                p_expected_liability_revision: control.liability_revision,
                p_applied_minimum_amount: appliedMinimum,
                p_succeeded: true,
                p_error: null,
            });
            if (completed.accepted !== true) {
                throw new HttpError(409, "platform payout protection lease was superseded");
            }
            if (completed.needsReapply === true) {
                claim = { claimed: true, control: objectAt(completed, "control") };
                continue;
            }
            return json({
                platformPayoutControlChangeId: changeId,
                providerOperationId: operation.id,
                liabilityRevision: platformPayoutControl(completed).liability_revision,
                appliedMinimumBalanceEur: appliedMinimum,
                decreaseAuthorizationId: appliedDecreaseAuthorizationId,
                payoutControl: publicBalanceSettings(provider),
                providerSnapshot: provider,
            });
        }
        throw new Error("platform payout requirements changed repeatedly during provider synchronization");
    } catch (error) {
        const message = errorMessage(error);
        if (operation) {
            await updateFinancialOperation(operation.id, { status: "manual_review", last_error: message }).catch(
                () => null,
            );
        }
        const control = platformPayoutControl(claim);
        await platformPayoutControlRpc("complete_platform_payout_protection", {
            p_owner: owner,
            p_expected_liability_revision: control.liability_revision,
            p_applied_minimum_amount: appliedMinimum,
            p_succeeded: false,
            p_error: message,
        }).catch(() => null);
        await insertRow<JsonRecord>("provider_exceptions", "id", {
            operation_id: operation?.id ?? null,
            exception_type: "platform_payout_protection_ambiguous",
            severity: "critical",
            message,
            details: {
                platformPayoutControlChangeId: changeId,
                requestedMinimumBalanceEur: minimumBalanceEur ?? 0,
                liabilityRevision: control.liability_revision,
            },
        }).catch(() => null);
        throw error;
    }
}

async function configureSellerPayoutSchedule(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, [
        "userId",
        "payoutScheduleChangeId",
        "interval",
        "weeklyPayoutDays",
        "monthlyPayoutDays",
        "minimumBalanceEur",
        "delayDaysOverride",
        "debitNegativeBalances",
        "reason",
    ]);
    const userId = requiredString(body, "userId", 200);
    const payoutScheduleChangeId = requiredString(body, "payoutScheduleChangeId", 200);
    const interval = requiredPayoutInterval(body, "interval");
    const weeklyPayoutDays = optionalWeeklyPayoutDays(body, "weeklyPayoutDays");
    const monthlyPayoutDays = optionalMonthlyPayoutDays(body, "monthlyPayoutDays");
    const minimumBalanceEur = optionalNonNegativeInteger(body, "minimumBalanceEur");
    const delayDaysOverride = optionalNonNegativeInteger(body, "delayDaysOverride");
    const debitNegativeBalances = optionalBoolean(body, "debitNegativeBalances");
    const reason = optionalText(body, "reason", 500);
    if (delayDaysOverride !== null && delayDaysOverride > 31) {
        throw new HttpError(400, "delayDaysOverride must be between zero and 31");
    }
    if (interval === "weekly" && weeklyPayoutDays.length === 0) {
        throw new HttpError(400, "weeklyPayoutDays is required for a weekly payout schedule");
    }
    if (interval !== "weekly" && weeklyPayoutDays.length > 0) {
        throw new HttpError(400, "weeklyPayoutDays is allowed only for a weekly payout schedule");
    }
    if (interval === "monthly" && monthlyPayoutDays.length === 0) {
        throw new HttpError(400, "monthlyPayoutDays is required for a monthly payout schedule");
    }
    if (interval !== "monthly" && monthlyPayoutDays.length > 0) {
        throw new HttpError(400, "monthlyPayoutDays is allowed only for a monthly payout schedule");
    }

    const existingAccount = await getAccountRow(userId);
    if (!existingAccount?.stripe_account_id) {
        throw new HttpError(404, "connected account not found");
    }
    const owner = crypto.randomUUID();
    const claim = await sellerPayoutHoldRpc("claim_seller_payout_hold", {
        p_seller_cms_user_id: userId,
        p_owner: owner,
        p_require_risk: false,
    });
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
    const operationRequest = stripUndefined({
        cmsUserId: userId,
        stripeAccountId: account.stripe_account_id,
        riskRevision: account.risk_revision,
        interval,
        weeklyPayoutDays: weeklyPayoutDays.length ? weeklyPayoutDays : undefined,
        monthlyPayoutDays: monthlyPayoutDays.length ? monthlyPayoutDays : undefined,
        minimumBalanceEur: minimumBalanceEur ?? undefined,
        delayDaysOverride: delayDaysOverride ?? undefined,
        debitNegativeBalances: debitNegativeBalances ?? undefined,
        reason: reason ?? undefined,
    });
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
                finalized.accepted === true && (await applyClaimedSellerRecoveryPayoutHold(userId, owner, finalized));
            if (!protectedByHold) {
                throw new HttpError(409, "seller risk changed and the replacement payout hold requires finance review");
            }
            const finalAccount = (await getAccountRow(userId)) ?? sellerRiskAccount(finalized);
            const finalProvider = await retrieveConnectedBalanceSettings(account.stripe_account_id);
            if (interval === "manual") {
                await updateFinancialOperation(operation.id, {
                    status: "succeeded",
                    response: finalProvider,
                    last_error: null,
                    completed_at: new Date().toISOString(),
                });
                return json({
                    ...publicSellerProviderRisk(finalAccount, null, finalProvider),
                    providerOperationId: operation.id,
                    payoutScheduleChangeId,
                });
            }
            throw new HttpError(409, "payout schedule change was superseded by seller financial risk");
        }

        const updatedAccount = sellerRiskAccount(finalized);
        await updateFinancialOperation(operation.id, {
            status: "succeeded",
            response: provider,
            last_error: null,
            completed_at: new Date().toISOString(),
        });
        return json({
            ...publicSellerProviderRisk(updatedAccount, null, provider),
            providerOperationId: operation.id,
            payoutScheduleChangeId,
        });
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
            await sellerPayoutHoldRpc("complete_seller_payout_hold", {
                p_seller_cms_user_id: userId,
                p_owner: owner,
                p_expected_risk_revision: account.risk_revision,
                p_applied_minimum_amount: account.provider_hold_minimum_amount,
                p_succeeded: false,
                p_error: message,
            }).catch(() => null);
            await insertRow<JsonRecord>("provider_exceptions", "id", {
                operation_id: operation?.id ?? null,
                exception_type: "payout_schedule_update_ambiguous",
                severity: "critical",
                message,
                details: { userId, payoutScheduleChangeId, requested: operationRequest },
            }).catch(() => null);
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
}

async function requestProtectedRefund(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, [
        "paymentId",
        "refundRequestId",
        "commerceRefundRequestId",
        "amount",
        "authorizedSellerAmount",
        "sellerEntitlementReductionAmount",
        "reason",
    ]);
    let payment = await requiredPayment(requiredInteger(body, "paymentId"));
    payment = await reconcilePayment(payment);
    const refundRequestId = requiredString(body, "refundRequestId", 200);
    const commerceRefundRequestId = optionalPositiveInteger(body, "commerceRefundRequestId");
    const amount = requiredInteger(body, "amount");
    const authorizedSellerAmount = requiredInteger(body, "authorizedSellerAmount");
    const sellerEntitlementReductionAmount = requiredInteger(body, "sellerEntitlementReductionAmount");
    const reason = optionalText(body, "reason", 500);
    if (sellerEntitlementReductionAmount < 0 || sellerEntitlementReductionAmount > amount) {
        throw new HttpError(400, "sellerEntitlementReductionAmount must be between zero and the refund amount");
    }
    if (authorizedSellerAmount < 0 || authorizedSellerAmount > payment.seller_transfer_amount) {
        throw new HttpError(400, "authorizedSellerAmount is invalid");
    }
    const existingRefund = await getRowByField<RefundRow>(
        "refunds",
        "refund_request_id",
        refundRequestId,
        refundSelect,
    );
    if (existingRefund) {
        if (
            existingRefund.authorized_seller_amount_after_refund !== authorizedSellerAmount ||
            existingRefund.seller_entitlement_reduction_amount !== sellerEntitlementReductionAmount
        ) {
            throw new HttpError(409, "refund seller entitlement replay mismatch");
        }
    } else {
        const refunds = await listRows<RefundRow>(
            `refunds?payment_id=eq.${payment.id}&select=${encodeURIComponent(refundSelect)}`,
        );
        if (refunds.some((refund) => ["reserved", "processing", "pending", "manual_review"].includes(refund.status))) {
            throw new HttpError(409, "another refund is awaiting terminal provider confirmation");
        }
        const committedReductionAmount = refunds
            .filter((refund) => refund.status === "succeeded")
            .reduce((sum, refund) => sum + refund.seller_entitlement_reduction_amount, 0);
        const expectedAuthorizedSellerAmount =
            payment.seller_transfer_amount - committedReductionAmount - sellerEntitlementReductionAmount;
        if (expectedAuthorizedSellerAmount !== authorizedSellerAmount) {
            throw new HttpError(409, "refund seller entitlement target is stale or invalid");
        }
    }
    const netTransferredAmount = payment.transferred_amount - payment.reversed_amount;
    const requiredRecoveryNow = Math.max(0, netTransferredAmount - authorizedSellerAmount);
    const recoveryRequestId = `${refundRequestId}:seller-recovery`;
    const existingRecovery = await getRowByField<TransferRecoveryRow>(
        "transfer_recovery_requests",
        "recovery_request_id",
        recoveryRequestId,
        transferRecoverySelect,
    );
    let reversal: JsonRecord | null = existingRecovery ? await loadPublicTransferRecovery(existingRecovery) : null;
    const requestedRecoveryAmount = existingRecovery?.requested_amount ?? requiredRecoveryNow;
    if (requestedRecoveryAmount > 0) {
        try {
            reversal = await executeTransferReversal(payment, recoveryRequestId, requestedRecoveryAmount, reason);
        } catch (error) {
            await recordSellerRecoveryExposure(
                payment,
                recoveryRequestId,
                "refund_recovery",
                "debt",
                requestedRecoveryAmount,
                "Protected Refund seller recovery is not available",
                { refundRequestId, error: errorMessage(error) },
            ).catch(() => null);
            await markPaymentManualReview(payment.id, "Protected Refund seller recovery failed", {
                refundRequestId,
                recoveryRequestId,
                error: errorMessage(error),
            }).catch(() => null);
            throw new HttpError(409, "seller recovery failed; refund requires finance review");
        }
        payment = await requiredPayment(payment.id);
        if (payment.transferred_amount - payment.reversed_amount > authorizedSellerAmount) {
            throw new HttpError(409, "seller recovery is not confirmed; refund remains blocked");
        }
    }
    const refund = await executeRefund(
        payment,
        refundRequestId,
        commerceRefundRequestId,
        amount,
        requestedRecoveryAmount,
        sellerEntitlementReductionAmount,
        authorizedSellerAmount,
        reason,
    );
    const currentPayment = await requiredPayment(payment.id);
    const reversalOperations =
        isRecord(reversal) && Array.isArray(reversal.reversals)
            ? reversal.reversals
                  .filter(isRecord)
                  .map((child) =>
                      normalizeProtectedRefundOperation("reversal", child, currentPayment.last_stripe_event_id),
                  )
            : [];
    const operations = [
        ...reversalOperations,
        normalizeProtectedRefundOperation("refund", refund, currentPayment.last_stripe_event_id),
    ];
    return json({ payment: publicPayment(currentPayment), reversal, refund, operations });
}

async function executeRefund(
    payment: ConnectPaymentRow,
    refundRequestId: string,
    commerceRefundRequestId: number | null,
    amount: number,
    requiredReversalAmount: number,
    sellerEntitlementReductionAmount: number,
    authorizedSellerAmount: number,
    reason: string | null,
): Promise<JsonRecord> {
    if (payment.payment_status !== "succeeded" || !payment.stripe_charge_id) {
        throw new HttpError(409, "payment is not refundable");
    }
    const existingRefund = await getRowByField<RefundRow>(
        "refunds",
        "refund_request_id",
        refundRequestId,
        refundSelect,
    );
    if (existingRefund) {
        if (
            existingRefund.payment_id !== payment.id ||
            existingRefund.amount !== amount ||
            existingRefund.required_reversal_amount !== requiredReversalAmount ||
            existingRefund.seller_entitlement_reduction_amount !== sellerEntitlementReductionAmount ||
            existingRefund.authorized_seller_amount_after_refund !== authorizedSellerAmount ||
            (existingRefund.commerce_refund_request_id ?? null) !== commerceRefundRequestId
        ) {
            throw new HttpError(409, "refund request replay mismatch");
        }
        if (["succeeded", "pending"].includes(existingRefund.status)) {
            return publicRefund(existingRefund);
        }
    }
    if (amount <= 0 || payment.refunded_amount + amount > payment.amount_total) {
        throw new HttpError(409, "refund exceeds the remaining captured amount");
    }
    if (requiredReversalAmount < 0 || requiredReversalAmount > amount) {
        throw new HttpError(400, "requiredReversalAmount is invalid");
    }
    if (payment.transferred_amount - payment.reversed_amount > authorizedSellerAmount) {
        throw new HttpError(409, "required seller Transfer Reversal is not confirmed");
    }
    const businessKey = `refund:${payment.id}:${refundRequestId}`;
    const operation = await reserveFinancialOperation(payment.id, {
        businessKey,
        operationType: "refund_create",
        request: {
            refundRequestId,
            commerceRefundRequestId,
            chargeId: payment.stripe_charge_id,
            amount,
            requiredReversalAmount,
            sellerEntitlementReductionAmount,
            authorizedSellerAmount,
            currency: payment.currency,
            reason,
        },
    });
    let refund = existingRefund;
    if (!refund) {
        refund = await insertRow<RefundRow>("refunds", refundSelect, {
            payment_id: payment.id,
            operation_id: operation.id,
            refund_request_id: refundRequestId,
            commerce_refund_request_id: commerceRefundRequestId,
            stripe_charge_id: payment.stripe_charge_id,
            amount,
            required_reversal_amount: requiredReversalAmount,
            seller_entitlement_reduction_amount: sellerEntitlementReductionAmount,
            authorized_seller_amount_after_refund: authorizedSellerAmount,
            currency: payment.currency,
            reason,
            status: "reserved",
        });
    } else if (
        refund.payment_id !== payment.id ||
        refund.amount !== amount ||
        refund.required_reversal_amount !== requiredReversalAmount ||
        refund.seller_entitlement_reduction_amount !== sellerEntitlementReductionAmount ||
        refund.authorized_seller_amount_after_refund !== authorizedSellerAmount ||
        (refund.commerce_refund_request_id ?? null) !== commerceRefundRequestId
    ) {
        throw new HttpError(409, "refund request replay mismatch");
    }
    try {
        let stripeRefund: StripeRefund | null = null;
        if (operation.status === "succeeded" && operation.stripe_object_id) {
            stripeRefund = await retrieveStripeRefund(operation.stripe_object_id);
        } else if (operation.attempt_count > 0) {
            stripeRefund = await findStripeRefund(payment.stripe_charge_id, refundRequestId, amount);
            if (!stripeRefund && operation.status === "manual_review") {
                throw new HttpError(409, "Refund outcome is unresolved and requires finance review");
            }
        }
        if (!stripeRefund) {
            await updateFinancialOperation(operation.id, {
                status: "processing",
                claimed_at: new Date().toISOString(),
                attempt_count: operation.attempt_count + 1,
            });
            await updateRow("refunds", refund.id, { status: "processing" });
            stripeRefund = await createStripeRefund(
                payment.stripe_charge_id,
                amount,
                refundRequestId,
                reason,
                await stableStripeIdempotencyKey("refund", businessKey),
            );
        }
        refund =
            (await updateRow<RefundRow>(
                "refunds",
                refund.id,
                {
                    stripe_refund_id: stripeRefund.id,
                },
                refundSelect,
            )) ?? refund;
        await applyStripeRefund(refund, stripeRefund);
        refund = (await getRowByField<RefundRow>("refunds", "id", String(refund.id), refundSelect)) ?? refund;
        return publicRefund(refund);
    } catch (error) {
        await moveOperationToManualReview(payment.id, operation, error, "refund_create_ambiguous");
        throw error;
    }
}

async function uploadStripeDisputeFile(request: Request): Promise<Response> {
    const { userId, actorKind } = requireDashboardAdmin(request);
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["disputeId", "fileName", "mimeType", "base64"]);
    const disputeId = requiredString(body, "disputeId", 200);
    const dispute = await requiredDispute(disputeId);
    const fileName = requiredString(body, "fileName", 200);
    const mimeType = requiredString(body, "mimeType", 100);
    if (!["image/jpeg", "image/png", "application/pdf"].includes(mimeType)) {
        throw new HttpError(400, "unsupported dispute evidence file type");
    }
    const bytes = decodeBase64(requiredString(body, "base64", 8_000_000));
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
        throw new HttpError(413, "dispute evidence file is too large");
    }
    const form = new FormData();
    form.set("purpose", "dispute_evidence");
    const fileBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    form.set("file", new Blob([fileBuffer], { type: mimeType }), fileName);
    const stripeFile = await uploadStripeDisputeEvidenceFile(form);
    await insertPaymentEvent(dispute.payment_id, "stripe_dispute_file_uploaded", actorKind, userId, {
        disputeId,
        stripeFileId: stripeFile.id,
        fileName,
    });
    return json({ fileId: stripeFile.id, fileName: stripeFile.filename ?? fileName, purpose: stripeFile.purpose }, 201);
}

async function stageStripeDisputeEvidence(request: Request): Promise<Response> {
    const { userId, actorKind } = requireDashboardAdmin(request);
    const body = await readJsonObject(request);
    assertAllowedKeys(body, [
        "disputeId",
        "evidenceOperationId",
        "evidence",
        "evidenceText",
        "customerCommunicationFileId",
        "shippingDocumentationFileId",
        "shippingTrackingNumber",
        "shippingDate",
        "receiptFileId",
        "productDescription",
        "customerName",
        "customerEmailAddress",
    ]);
    const disputeId = requiredString(body, "disputeId", 200);
    const evidenceOperationId = requiredString(body, "evidenceOperationId", 200);
    const dispute = await requiredDispute(disputeId);
    if (terminalDisputeStatus(dispute.status)) {
        throw new HttpError(409, "Stripe dispute is already terminal");
    }
    const evidence = sanitizeDisputeEvidence(flattenDisputeEvidence(body));
    let row = await getRowByField<JsonRecord>(
        "stripe_dispute_evidence",
        "evidence_operation_id",
        evidenceOperationId,
        "*",
    );
    if (row) {
        if (Number(row.dispute_id) !== dispute.id || !jsonEqual(row.evidence, evidence)) {
            throw new HttpError(409, "dispute evidence replay mismatch");
        }
    } else {
        row = await insertRow<JsonRecord>("stripe_dispute_evidence", "*", {
            dispute_id: dispute.id,
            evidence_operation_id: evidenceOperationId,
            evidence,
            staged_by: userId,
        });
        await updateRow("stripe_disputes", dispute.id, { evidence_status: "staged" });
        await insertPaymentEvent(dispute.payment_id, "stripe_dispute_evidence_staged", actorKind, userId, {
            disputeId,
            evidenceOperationId,
        });
    }
    return json({ evidenceOperationId, disputeId, status: "staged", stagedAt: row.staged_at });
}

async function submitStripeDisputeEvidence(request: Request): Promise<Response> {
    const { userId, actorKind } = requireDashboardAdmin(request);
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["disputeId", "submissionOperationId", "evidenceOperationId", "confirmation"]);
    const dispute = await requiredDispute(requiredString(body, "disputeId", 200));
    if (requiredString(body, "confirmation", 50) !== "SUBMIT STRIPE EVIDENCE") {
        throw new HttpError(400, "explicit evidence submission confirmation is required");
    }
    const evidenceOperationId = requiredString(body, "evidenceOperationId", 200);
    const staged = await getRowByField<JsonRecord>(
        "stripe_dispute_evidence",
        "evidence_operation_id",
        evidenceOperationId,
        "*",
    );
    if (!staged || Number(staged.dispute_id) !== dispute.id) {
        throw new HttpError(404, "staged dispute evidence not found");
    }
    const submissionOperationId = requiredString(body, "submissionOperationId", 200);
    const businessKey = `dispute-evidence:${dispute.stripe_dispute_id}:${submissionOperationId}`;
    const operationRequest = { disputeId: dispute.stripe_dispute_id, evidenceOperationId };
    const existingOperation = await getRowByField<FinancialOperationRow>(
        "financial_operations",
        "business_key",
        businessKey,
        operationSelect,
    );
    if (existingOperation?.status === "succeeded" && jsonEqual(existingOperation.request, operationRequest)) {
        return json({
            disputeId: dispute.stripe_dispute_id,
            evidenceStatus: "submitted",
            operationId: existingOperation.id,
        });
    }
    if (existingOperation && !jsonEqual(existingOperation.request, operationRequest)) {
        throw new HttpError(409, "dispute evidence submission replay mismatch");
    }
    if (terminalDisputeStatus(dispute.status)) {
        throw new HttpError(409, "Stripe dispute is already terminal");
    }
    if (dispute.evidence_due_by && Date.parse(dispute.evidence_due_by) <= Date.now()) {
        throw new HttpError(409, "Stripe evidence deadline has passed");
    }
    if (["submitted", "accepted", "closed"].includes(dispute.evidence_status) || staged.submitted_at) {
        throw new HttpError(409, "Stripe dispute evidence was already submitted irreversibly");
    }
    const approval = await authorizeIrreversibleDisputeAction({
        actionKey: businessKey,
        actionType: "dispute_evidence_submit",
        dispute,
        actorId: userId,
        actorKind,
        payload: operationRequest,
    });
    if (!approval.approved) {
        await insertPaymentEvent(
            dispute.payment_id,
            "stripe_dispute_evidence_first_approval_recorded",
            actorKind,
            userId,
            {
                disputeId: dispute.stripe_dispute_id,
                submissionOperationId,
                approvalStatus: approval.approvalStatus,
            },
        );
        return json(
            {
                disputeId: dispute.stripe_dispute_id,
                evidenceStatus: "staged",
                approvalStatus: approval.approvalStatus,
                dualApprovalRequired: approval.dualApprovalRequired,
                firstApprovedBy: approval.firstApprovedBy,
            },
            202,
        );
    }
    const operation = await reserveFinancialOperation(dispute.payment_id, {
        businessKey,
        operationType: "dispute_evidence_submit",
        request: operationRequest,
    });
    if (operation.status !== "succeeded") {
        try {
            await updateFinancialOperation(operation.id, {
                status: "processing",
                attempt_count: operation.attempt_count + 1,
            });
            const provider = await updateStripeDisputeEvidence(
                dispute.stripe_dispute_id,
                staged.evidence as JsonRecord,
                await stableStripeIdempotencyKey("dispute-evidence", operation.business_key),
            );
            await updateFinancialOperation(operation.id, {
                status: "succeeded",
                stripe_object_id: dispute.stripe_dispute_id,
                response: provider,
                completed_at: new Date().toISOString(),
            });
            await updateRow("stripe_dispute_evidence", Number(staged.id), {
                submitted_operation_id: operation.id,
                submitted_at: new Date().toISOString(),
            });
            await updateRow("stripe_disputes", dispute.id, {
                evidence_status: "submitted",
                provider_snapshot: provider,
            });
            await insertPaymentEvent(dispute.payment_id, "stripe_dispute_evidence_submitted", actorKind, userId, {
                disputeId: dispute.stripe_dispute_id,
                operationId: operation.id,
                approvalStatus: approval.approvalStatus,
                firstApprovedBy: approval.firstApprovedBy,
                secondApprovedBy: approval.secondApprovedBy ?? null,
            });
        } catch (error) {
            await moveOperationToManualReview(
                dispute.payment_id,
                operation,
                error,
                "dispute_evidence_submission_ambiguous",
            );
            throw error;
        }
    }
    return json({
        disputeId: dispute.stripe_dispute_id,
        evidenceStatus: "submitted",
        operationId: operation.id,
        approvalStatus: approval.approvalStatus,
        dualApprovalRequired: approval.dualApprovalRequired,
    });
}

async function acceptStripeDispute(request: Request): Promise<Response> {
    const { userId, actorKind } = requireDashboardAdmin(request);
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["disputeId", "acceptanceOperationId", "confirmation"]);
    const dispute = await requiredDispute(requiredString(body, "disputeId", 200));
    if (requiredString(body, "confirmation", 50) !== "ACCEPT STRIPE DISPUTE") {
        throw new HttpError(400, "explicit dispute acceptance confirmation is required");
    }
    const acceptanceOperationId = requiredString(body, "acceptanceOperationId", 200);
    const businessKey = `dispute-accept:${dispute.stripe_dispute_id}:${acceptanceOperationId}`;
    const operationRequest = { disputeId: dispute.stripe_dispute_id };
    const existingOperation = await getRowByField<FinancialOperationRow>(
        "financial_operations",
        "business_key",
        businessKey,
        operationSelect,
    );
    if (existingOperation?.status === "succeeded" && jsonEqual(existingOperation.request, operationRequest)) {
        return json({
            disputeId: dispute.stripe_dispute_id,
            evidenceStatus: "accepted",
            operationId: existingOperation.id,
        });
    }
    if (existingOperation && !jsonEqual(existingOperation.request, operationRequest)) {
        throw new HttpError(409, "dispute acceptance replay mismatch");
    }
    if (terminalDisputeStatus(dispute.status)) {
        throw new HttpError(409, "Stripe dispute is already terminal");
    }
    if (["accepted", "closed"].includes(dispute.evidence_status)) {
        throw new HttpError(409, "Stripe dispute was already accepted irreversibly");
    }
    if (dispute.evidence_due_by && Date.parse(dispute.evidence_due_by) <= Date.now()) {
        throw new HttpError(409, "Stripe dispute deadline has passed; refresh provider state before acceptance");
    }
    const approval = await authorizeIrreversibleDisputeAction({
        actionKey: businessKey,
        actionType: "dispute_accept",
        dispute,
        actorId: userId,
        actorKind,
        payload: operationRequest,
    });
    if (!approval.approved) {
        await insertPaymentEvent(
            dispute.payment_id,
            "stripe_dispute_acceptance_first_approval_recorded",
            actorKind,
            userId,
            {
                disputeId: dispute.stripe_dispute_id,
                acceptanceOperationId,
                approvalStatus: approval.approvalStatus,
            },
        );
        return json(
            {
                disputeId: dispute.stripe_dispute_id,
                evidenceStatus: dispute.evidence_status,
                approvalStatus: approval.approvalStatus,
                dualApprovalRequired: approval.dualApprovalRequired,
                firstApprovedBy: approval.firstApprovedBy,
            },
            202,
        );
    }
    const operation = await reserveFinancialOperation(dispute.payment_id, {
        businessKey,
        operationType: "dispute_accept",
        request: operationRequest,
    });
    if (operation.status !== "succeeded") {
        try {
            await updateFinancialOperation(operation.id, {
                status: "processing",
                attempt_count: operation.attempt_count + 1,
            });
            const provider = await closeStripeDispute(
                dispute.stripe_dispute_id,
                await stableStripeIdempotencyKey("dispute-accept", operation.business_key),
            );
            await updateFinancialOperation(operation.id, {
                status: "succeeded",
                stripe_object_id: dispute.stripe_dispute_id,
                response: provider,
                completed_at: new Date().toISOString(),
            });
            await updateRow("stripe_disputes", dispute.id, {
                evidence_status: "accepted",
                provider_snapshot: provider,
            });
            await insertPaymentEvent(dispute.payment_id, "stripe_dispute_accepted", actorKind, userId, {
                disputeId: dispute.stripe_dispute_id,
                operationId: operation.id,
                approvalStatus: approval.approvalStatus,
                firstApprovedBy: approval.firstApprovedBy,
                secondApprovedBy: approval.secondApprovedBy ?? null,
            });
        } catch (error) {
            await moveOperationToManualReview(dispute.payment_id, operation, error, "dispute_acceptance_ambiguous");
            throw error;
        }
    }
    return json({
        disputeId: dispute.stripe_dispute_id,
        evidenceStatus: "accepted",
        operationId: operation.id,
        approvalStatus: approval.approvalStatus,
        dualApprovalRequired: approval.dualApprovalRequired,
    });
}

async function reconcileProviderPayment(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["paymentId"]);
    const payment = await requiredPayment(requiredInteger(body, "paymentId"));
    return json(publicPayment(await reconcilePayment(payment)));
}

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

async function ingestStripeWebhook(
    request: Request,
    endpointKind: "platform" | "connect" | "connect_v2",
): Promise<Response> {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > stripeWebhookMaximumBytes) {
        throw new HttpError(413, "Stripe webhook payload is too large");
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > stripeWebhookMaximumBytes) {
        throw new HttpError(413, "Stripe webhook payload is too large");
    }
    const rawBody = new TextDecoder().decode(bytes);
    await verifyStripeWebhookSignature(
        rawBody,
        request.headers.get("stripe-signature") ?? "",
        endpointKind === "platform"
            ? "STRIPE_WEBHOOK_SECRET"
            : endpointKind === "connect_v2"
              ? "STRIPE_CONNECT_V2_WEBHOOK_SECRET"
              : "STRIPE_CONNECT_WEBHOOK_SECRET",
    );
    let event: JsonRecord;
    try {
        const parsed = JSON.parse(rawBody);
        if (!isRecord(parsed)) {
            throw new Error("not an object");
        }
        event = parsed;
    } catch {
        throw new HttpError(400, "invalid Stripe event JSON");
    }
    const expectedLivemode = stripeLivemode();
    if (typeof event.livemode !== "boolean" || event.livemode !== expectedLivemode) {
        throw new HttpError(400, "Stripe webhook livemode does not match configured API keys");
    }
    const eventId = requiredRecordString(event, "id", 255);
    const eventType = requiredRecordString(event, "type", 255);
    const providerCreatedAt = stripeEventCreatedAt(event);
    const dataObject = objectAt(objectAt(event, "data"), "object");
    const relatedObject = objectAt(event, "related_object");
    const connectedAccountId =
        endpointKind === "connect_v2" ? stringAt(relatedObject, "id") : stringAt(event, "account");
    if (endpointKind === "platform" && connectedAccountId) {
        throw new HttpError(400, "connected-account event sent to platform Stripe webhook");
    }
    if (endpointKind === "connect" && !connectedAccountId) {
        throw new HttpError(400, "platform event sent to Stripe Connect webhook");
    }
    if (
        endpointKind === "connect_v2" &&
        (!eventType.startsWith("v2.core.account") ||
            stringAt(relatedObject, "type") !== "v2.core.account" ||
            !connectedAccountId)
    ) {
        throw new HttpError(400, "non-account event sent to Stripe Connect v2 webhook");
    }
    const stripeAccountId = connectedAccountId || "platform";
    const payloadSha256 = await digest(rawBody);
    const inserted = await insertStripeEventDurably({
        stripe_account_id: stripeAccountId,
        event_id: eventId,
        event_type: eventType,
        object_id: stringAt(dataObject, "id") || stringAt(relatedObject, "id") || null,
        api_version: stringAt(event, "api_version") || null,
        livemode: event.livemode === true,
        provider_created_at: providerCreatedAt,
        payload_sha256: payloadSha256,
        payload: event,
        processing_status: "pending",
    });
    return json({ received: true, duplicate: !inserted }, inserted ? 202 : 200);
}

async function findStripeRefund(
    chargeId: string,
    refundRequestId: string,
    amount: number,
): Promise<StripeRefund | null> {
    const list = await listStripeRefundsByCharge(chargeId, true);
    const matches = recordArrayAt(list, "data").filter(
        (refund) =>
            Number(refund.amount) === amount &&
            stripeObjectId(refund.charge) === chargeId &&
            stringAt(objectAt(refund, "metadata"), "refund_request_id") === refundRequestId,
    );
    if (matches.length > 1 || (matches.length === 0 && list.has_more === true)) {
        throw new HttpError(409, "Stripe Refund search is ambiguous");
    }
    return (matches[0] as StripeRefund | undefined) ?? null;
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
    const payment = await requiredPayment(options.dispute.payment_id);
    const response = await rest("rpc/authorize_irreversible_dispute_action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_action_key: options.actionKey,
            p_action_type: options.actionType,
            p_dispute_id: options.dispute.id,
            p_amount: options.dispute.amount,
            p_threshold_amount: payment.dual_approval_threshold_amount,
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

async function reconcilePayment(payment: ConnectPaymentRow): Promise<ConnectPaymentRow> {
    let current = await syncPayment(payment);
    if (current.stripe_charge_id) {
        await reconcileProviderDisputes(current);
        await reconcileProviderRefunds(current);
        await reconcileProviderTransfers(current);
    }
    const localContext = await readPaymentReconciliationLocalContext(payment.id);
    if (current.stripe_charge_id) {
        const refreshedPayment = localContext.payment as unknown as ConnectPaymentRow | null;
        if (!refreshedPayment) {
            throw new HttpError(404, "payment not found");
        }
        current = refreshedPayment;
    }
    const refunds = localContext.refunds as unknown as RefundRow[];
    for (const refund of refunds) {
        if (!refund.stripe_refund_id || refund.status === "succeeded") {
            continue;
        }
        const provider = await retrieveStripeRefundSnapshot(refund.stripe_refund_id);
        await applyStripeRefund(refund, provider);
    }
    const ledger = await readPaymentReconciliationLedger(payment.id);
    const refundedAmount = Number(ledger.refunded_amount);
    const transferredAmount = Number(ledger.transferred_amount);
    const reversedAmount = Number(ledger.reversed_amount);
    const sellerRecoveryAmount = Number(ledger.seller_recovery_amount);
    const authorizedSellerAmount = current.seller_transfer_amount - sellerRecoveryAmount;
    const netTransferredAmount = transferredAmount - reversedAmount;
    if (
        refundedAmount > current.amount_total ||
        reversedAmount > transferredAmount ||
        sellerRecoveryAmount > current.seller_transfer_amount ||
        netTransferredAmount > authorizedSellerAmount
    ) {
        await markPaymentManualReview(current.id, "provider ledger arithmetic divergence", {
            refundedAmount,
            transferredAmount,
            reversedAmount,
            sellerRecoveryAmount,
            authorizedSellerAmount,
            netTransferredAmount,
        });
        current = await requiredPayment(current.id);
        throw new HttpError(409, "provider ledger arithmetic divergence requires finance review");
    } else {
        current =
            (await updatePayment(current.id, {
                refunded_amount: refundedAmount,
                transferred_amount: transferredAmount,
                reversed_amount: reversedAmount,
                last_provider_sync_at: new Date().toISOString(),
            })) ?? current;
    }
    return current;
}

async function reconcileProviderDisputes(payment: ConnectPaymentRow): Promise<void> {
    if (!payment.stripe_charge_id) {
        return;
    }
    const listed = await listStripeDisputesByCharge(payment.stripe_charge_id);
    if (listed.has_more === true) {
        throw new HttpError(409, "Stripe dispute search is incomplete");
    }
    for (const value of recordArrayAt(listed, "data")) {
        const disputeId = stringAt(value, "id");
        if (!disputeId) {
            throw new Error("Stripe dispute search returned an object without id");
        }
        await applyStripeDispute(
            value as StripeDispute,
            `provider-reconciliation:dispute:${disputeId}:${stringAt(value, "status") || "unknown"}`,
        );
    }
}

async function reconcileProviderRefunds(payment: ConnectPaymentRow): Promise<void> {
    if (!payment.stripe_charge_id) {
        return;
    }
    const listed = await listStripeRefundsByCharge(payment.stripe_charge_id);
    if (listed.has_more === true) {
        throw new HttpError(409, "Stripe refund search is incomplete");
    }
    for (const value of recordArrayAt(listed, "data")) {
        const refundId = stringAt(value, "id");
        if (!refundId) {
            throw new Error("Stripe refund search returned an object without id");
        }
        const local = await getRowByField<RefundRow>("refunds", "stripe_refund_id", refundId, refundSelect);
        if (local) {
            await applyStripeRefund(local, value as StripeRefund);
            continue;
        }
        await quarantineUntrackedProviderObject(payment, "refund", refundId, value);
    }
}

async function reconcileProviderTransfers(payment: ConnectPaymentRow): Promise<void> {
    const listed = await listStripeTransfersByGroup(payment.transfer_group);
    if (listed.has_more === true) {
        throw new HttpError(409, "Stripe Transfer search is incomplete");
    }
    for (const value of recordArrayAt(listed, "data")) {
        const transferId = stringAt(value, "id");
        if (!transferId) {
            throw new Error("Stripe Transfer search returned an object without id");
        }
        const context = await readProviderTransferReconciliationContext(transferId);
        const local = context.transfer as unknown as TransferRow | null;
        if (!local) {
            await quarantineUntrackedProviderObject(payment, "transfer", transferId, value);
            continue;
        }
        const providerReversedAmount = numberAt(value, "amount_reversed") ?? 0;
        const localReversedAmount = Number(context.local_reversed_amount);
        if (providerReversedAmount !== localReversedAmount) {
            await quarantineUntrackedProviderObject(payment, "transfer_reversal", transferId, {
                ...value,
                providerReversedAmount,
                localReversedAmount,
            });
        }
        await updateRow("transfers", local.id, {
            status:
                value.reversed === true ? "reversed" : providerReversedAmount > 0 ? "partially_reversed" : "succeeded",
            provider_snapshot: value,
        });
    }
}

async function quarantineUntrackedProviderObject(
    payment: ConnectPaymentRow,
    objectType: string,
    objectId: string,
    providerSnapshot: JsonRecord,
): Promise<void> {
    const reason = `untracked Stripe ${objectType} ${objectId}`;
    await markPaymentManualReview(payment.id, reason, { objectType, objectId, providerSnapshot });
    await upsertProviderException(`untracked:${objectType}:${objectId}`, {
        payment_id: payment.id,
        exception_type: `untracked_provider_${objectType}`,
        severity: "critical",
        status: "open",
        message: reason,
        details: { providerSnapshot },
    });
}

async function processStripeEvent(row: JsonRecord): Promise<boolean> {
    const event = row.payload;
    if (!isRecord(event)) {
        throw new Error("stored Stripe event payload is invalid");
    }
    const eventType = stringAt(event, "type");
    const apiVersion = stringAt(event, "api_version");
    const expectedApiVersion = eventType.startsWith("v2.") ? stripeV2ApiVersion : stripeV1ApiVersion;
    if (apiVersion && apiVersion !== expectedApiVersion) {
        throw new Error(`Stripe webhook API version mismatch: ${apiVersion}`);
    }
    const eventId = stringAt(event, "id");
    const object = objectAt(objectAt(event, "data"), "object");
    const objectId = stringAt(object, "id") || stringAt(row, "object_id");

    if (eventType.startsWith("v2.core.account")) {
        if (!objectId) {
            throw new Error("Stripe Accounts v2 event has no related account id");
        }
        const account = await getAccountRowByStripeAccountId(objectId);
        if (!account) {
            return false;
        }
        if (account.stripe_account_api_version !== "v2") {
            throw new Error("Stripe Accounts v2 event targets a non-v2 local account");
        }
        const provider = await retrieveAccount(objectId, "v2");
        await updateAccountRow(account.cms_user_id, {
            ...accountPatchFromStripe(provider, "v2"),
            last_provider_sync_at: new Date().toISOString(),
        });
        return true;
    }

    if (eventType.startsWith("payment_intent.")) {
        if (!objectId) {
            throw new Error("Stripe PaymentIntent event has no object id");
        }
        const payment = await getRowByField<ConnectPaymentRow>(
            "payments",
            "stripe_payment_intent_id",
            objectId,
            paymentSelect,
        );
        if (!payment) {
            return false;
        }
        const intent = await retrievePaymentIntent(objectId);
        const applied = await applyPaymentIntent(payment, intent, {
            actorKind: "webhook",
            actorId: eventId,
        });
        await updatePayment(applied.id, {
            last_stripe_event_id: eventId,
        });
        await insertPaymentEvent(payment.id, `stripe_${eventType}`, "webhook", eventId, { objectId });
        return true;
    }

    if (eventType === "charge.succeeded" || eventType === "charge.failed") {
        const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : "";
        const payment = paymentIntentId
            ? await getRowByField<ConnectPaymentRow>(
                  "payments",
                  "stripe_payment_intent_id",
                  paymentIntentId,
                  paymentSelect,
              )
            : objectId
              ? await getRowByField<ConnectPaymentRow>("payments", "stripe_charge_id", objectId, paymentSelect)
              : null;
        if (!payment) {
            return false;
        }
        const providerPaymentIntentId = paymentIntentId || payment.stripe_payment_intent_id;
        const providerIntent = providerPaymentIntentId ? await retrievePaymentIntent(providerPaymentIntentId) : null;
        const applied = !providerIntent
            ? await quarantineProviderPaymentTruth(
                  payment,
                  { id: "missing", status: "succeeded", latest_charge: object },
                  ["charge_payment_intent"],
                  { actorKind: "webhook", actorId: eventId },
              )
            : eventType === "charge.succeeded" && objectId !== chargeId(providerIntent)
              ? await quarantineProviderPaymentTruth(payment, providerIntent, ["charge_event_id"], {
                    actorKind: "webhook",
                    actorId: eventId,
                })
              : await applyPaymentIntent(payment, providerIntent, {
                    actorKind: "webhook",
                    actorId: eventId,
                });
        await updatePayment(applied.id, {
            last_stripe_event_id: eventId,
            last_provider_sync_at: new Date().toISOString(),
        });
        return true;
    }

    if (eventType.startsWith("refund.") || eventType === "charge.refunded") {
        const refundId = eventType.startsWith("refund.") ? objectId : "";
        if (refundId) {
            const refund = await getRowByField<RefundRow>("refunds", "stripe_refund_id", refundId, refundSelect);
            if (!refund) {
                return false;
            }
            const provider = await retrieveStripeRefundSnapshot(refundId);
            await applyStripeRefund(refund, provider);
            await updatePayment(refund.payment_id, { last_stripe_event_id: eventId });
            return true;
        }
        const chargeId = objectId;
        const payment = chargeId
            ? await getRowByField<ConnectPaymentRow>("payments", "stripe_charge_id", chargeId, paymentSelect)
            : null;
        if (!payment) {
            return false;
        }
        await reconcilePayment(payment);
        await updatePayment(payment.id, { last_stripe_event_id: eventId });
        return true;
    }

    if (eventType.startsWith("charge.dispute.")) {
        if (!objectId) {
            throw new Error("Stripe dispute event has no object id");
        }
        const provider = await retrieveStripeDispute(objectId);
        await applyStripeDispute(provider, eventId, eventType, stringAt(row, "provider_created_at") || null);
        return true;
    }

    if (eventType.startsWith("transfer.")) {
        if (!objectId) {
            return false;
        }
        const transfer = await getRowByField<TransferRow>("transfers", "stripe_transfer_id", objectId, transferSelect);
        if (!transfer) {
            return false;
        }
        const amountReversed = Number(object.amount_reversed ?? 0);
        await updateRow("transfers", transfer.id, {
            status: object.reversed === true ? "reversed" : amountReversed > 0 ? "partially_reversed" : "succeeded",
            provider_snapshot: object,
        });
        await updatePayment(transfer.payment_id, { last_stripe_event_id: eventId });
        return true;
    }

    if (eventType === "account.updated") {
        if (!objectId) {
            return false;
        }
        const account = await getAccountRowByStripeAccountId(objectId);
        if (!account) {
            return false;
        }
        const provider = await retrieveAccount(objectId, account.stripe_account_api_version);
        await updateAccountRow(account.cms_user_id, {
            ...accountPatchFromStripe(provider, account.stripe_account_api_version),
            last_provider_sync_at: new Date().toISOString(),
        });
        return true;
    }

    if (eventType.startsWith("payout.")) {
        const stripeAccountId = stringAt(event, "account") || "platform";
        if (!objectId) {
            return false;
        }
        const account = stripeAccountId === "platform" ? null : await getAccountRowByStripeAccountId(stripeAccountId);
        let providerSnapshot = object;
        let payoutTruthError: string | null = null;
        if (typeof providerSnapshot.automatic !== "boolean" && stringAt(providerSnapshot, "method") !== "instant") {
            try {
                providerSnapshot = await retrieveStripePayout(objectId, stripeAccountId);
            } catch (error) {
                payoutTruthError = errorMessage(error);
            }
        }
        const manualPayout = providerSnapshot.automatic === false;
        const instantPayout = stringAt(providerSnapshot, "method") === "instant";
        const ambiguousPayout = !manualPayout && !instantPayout && providerSnapshot.automatic !== true;
        const failedPayout = eventType === "payout.failed" || stringAt(providerSnapshot, "status") === "failed";
        const connectedEmergencyHold = Boolean(
            account &&
                (account.manual_payout_hold_started_at ||
                    account.outstanding_debt_amount > 0 ||
                    account.financial_exposure_amount > 0),
        );
        let platformControlDrift = false;
        if (!account && !manualPayout && !instantPayout && !ambiguousPayout) {
            try {
                const [settings, control] = await Promise.all([
                    retrievePlatformBalanceSettings(),
                    getRowByField<PlatformPayoutControlRow>("platform_payout_controls", "control_key", "default", "*"),
                ]);
                const payouts = objectAt(objectAt(settings, "payments"), "payouts");
                const interval = stringAt(objectAt(payouts, "schedule"), "interval");
                const minimum = numberAt(objectAt(payouts, "minimum_balance_by_currency"), "eur") ?? 0;
                platformControlDrift =
                    !control ||
                    interval !== protectedPlatformPayoutInterval ||
                    minimum < Math.max(control.required_minimum_amount, control.provider_minimum_amount);
            } catch {
                platformControlDrift = true;
            }
        }
        await upsertRow<JsonRecord>("payout_events", "stripe_payout_id", "*", {
            cms_user_id: account?.cms_user_id ?? null,
            stripe_account_id: stripeAccountId,
            stripe_payout_id: objectId,
            amount: Number.isSafeInteger(providerSnapshot.amount) ? providerSnapshot.amount : null,
            currency: stringAt(providerSnapshot, "currency") || null,
            status: stringAt(providerSnapshot, "status") || eventType.slice("payout.".length),
            failure_code: stringAt(providerSnapshot, "failure_code") || null,
            failure_message: stringAt(providerSnapshot, "failure_message") || null,
            provider_snapshot: providerSnapshot,
        });
        const unexpectedPayout =
            manualPayout || instantPayout || ambiguousPayout || connectedEmergencyHold || platformControlDrift;
        if (account && (failedPayout || unexpectedPayout)) {
            await updateAccountRow(account.cms_user_id, {
                risk_status: "manual_review",
                financial_hold_reason: unexpectedPayout
                    ? ambiguousPayout
                        ? "Stripe payout control mode is ambiguous"
                        : connectedEmergencyHold
                          ? "Automatic payout conflicts with an emergency seller hold"
                          : platformControlDrift
                            ? "Automatic payout occurred while platform controls were inconsistent"
                            : "Unexpected manual or instant Stripe payout"
                    : "Stripe payout failed",
            });
        }
        if (unexpectedPayout) {
            await upsertProviderException(`unexpected-payout:${stripeAccountId}:${objectId}`, {
                exception_type: "unexpected_provider_payout",
                severity: "critical",
                message: ambiguousPayout
                    ? "Stripe payout control mode could not be verified"
                    : connectedEmergencyHold
                      ? "Stripe reported an automatic payout during an emergency seller hold"
                      : platformControlDrift
                        ? "Stripe reported an automatic platform payout while payout protection had drifted"
                        : "Stripe reported a platform-controlled manual or instant payout",
                details: {
                    stripeAccountId,
                    stripePayoutId: objectId,
                    eventType,
                    providerSnapshot,
                    payoutTruthError,
                    connectedEmergencyHold,
                    platformControlDrift,
                },
            });
        } else {
            await resolveProviderException(`unexpected-payout:${stripeAccountId}:${objectId}`);
        }
        if (failedPayout) {
            await upsertProviderException(`failed-payout:${stripeAccountId}:${objectId}`, {
                exception_type: "provider_payout_failed",
                severity: "critical",
                message: "Stripe reported a failed payout",
                details: { stripeAccountId, stripePayoutId: objectId, eventType, providerSnapshot },
            });
        }
        return true;
    }

    return false;
}

async function applyStripeRefund(refund: RefundRow, provider: StripeRefund): Promise<void> {
    const status = refundStatusFromStripe(provider);
    if (["succeeded", "failed", "cancelled"].includes(refund.status) && refund.status !== status) {
        await upsertProviderException(`refund-terminal-conflict:${refund.id}`, {
            payment_id: refund.payment_id,
            operation_id: refund.operation_id,
            exception_type: "refund_terminal_state_conflict",
            severity: "critical",
            message: "Stripe reported a refund state after a different terminal state was recorded",
            details: { refundId: refund.id, recordedStatus: refund.status, providerSnapshot: provider },
        });
        return;
    }
    const balanceTransaction = status === "succeeded" ? await resolveRefundBalanceTransaction(provider, refund) : null;
    const updatedRefund =
        (await updateRow<RefundRow>(
            "refunds",
            refund.id,
            {
                status,
                failure_reason: stringAt(provider, "failure_reason") || null,
                stripe_balance_transaction_id: balanceTransaction
                    ? stringAt(balanceTransaction, "id")
                    : refund.stripe_balance_transaction_id,
                actual_stripe_fee_amount: balanceTransaction
                    ? numberAt(balanceTransaction, "fee")
                    : refund.actual_stripe_fee_amount,
                actual_stripe_net_amount: balanceTransaction
                    ? numberAt(balanceTransaction, "net")
                    : refund.actual_stripe_net_amount,
                actual_stripe_fee_currency: balanceTransaction
                    ? stringAt(balanceTransaction, "currency").toLowerCase()
                    : refund.actual_stripe_fee_currency,
                actual_stripe_fee_details: balanceTransaction
                    ? recordArrayAt(balanceTransaction, "fee_details")
                    : refund.actual_stripe_fee_details,
                provider_snapshot: provider,
            },
            refundSelect,
        )) ?? refund;
    await updateFinancialOperation(refund.operation_id, {
        status:
            status === "succeeded" ? "succeeded" : ["failed", "cancelled"].includes(status) ? "failed" : "processing",
        stripe_object_id: provider.id,
        response: provider,
        last_error: ["failed", "cancelled"].includes(status)
            ? stringAt(provider, "failure_reason") || `Stripe Refund ${status}`
            : null,
        completed_at: status === "succeeded" ? new Date().toISOString() : null,
    });
    if (["pending", "succeeded", "failed", "cancelled"].includes(status)) {
        await enqueueCommerceRefundProjection(updatedRefund.id);
    }
    const refundedAmount = await sumSucceededAmounts("refunds", refund.payment_id);
    const refundFeeAmount = await sumSucceededField("refunds", refund.payment_id, "actual_stripe_fee_amount");
    const payment = await requiredPayment(refund.payment_id);
    const authorizedSellerAmount = await authorizedSellerAmountAfterRefunds(payment);
    await updatePayment(refund.payment_id, {
        refunded_amount: refundedAmount,
        actual_stripe_refund_fee_amount: refundFeeAmount,
        actual_stripe_processing_fee_amount: payment.actual_stripe_charge_fee_amount + refundFeeAmount,
        settlement_status:
            status === "failed"
                ? "manual_review"
                : status === "pending"
                  ? "refund_pending"
                  : payment.settlement_status === "manual_review"
                    ? "manual_review"
                    : refundedAmount >= payment.amount_total
                      ? "refunded"
                      : payment.transferred_amount - payment.reversed_amount >= authorizedSellerAmount
                        ? "released"
                        : "held",
        last_provider_sync_at: new Date().toISOString(),
    });
}

async function resolveRefundBalanceTransaction(provider: StripeRefund, refund: RefundRow): Promise<JsonRecord> {
    const raw = provider.balance_transaction;
    const transaction = isRecord(raw)
        ? raw
        : typeof raw === "string" && raw.startsWith("txn_")
          ? await retrieveStripeBalanceTransaction(raw)
          : null;
    if (!transaction) {
        throw new HttpError(409, "succeeded Stripe Refund omitted its balance transaction");
    }
    const id = stringAt(transaction, "id");
    const amount = numberAt(transaction, "amount");
    const fee = numberAt(transaction, "fee");
    const net = numberAt(transaction, "net");
    const currency = stringAt(transaction, "currency").toLowerCase();
    if (
        !id.startsWith("txn_") ||
        amount !== -refund.amount ||
        !Number.isSafeInteger(fee) ||
        !Number.isSafeInteger(net) ||
        net !== amount! - fee! ||
        currency !== refund.currency ||
        !Array.isArray(transaction.fee_details)
    ) {
        throw new HttpError(409, "Stripe Refund balance transaction does not match immutable refund truth");
    }
    if (refund.stripe_balance_transaction_id && refund.stripe_balance_transaction_id !== id) {
        throw new HttpError(409, "Stripe Refund balance transaction replay changed identity");
    }
    return transaction;
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
    const payment = await getRowByField<ConnectPaymentRow>("payments", "stripe_charge_id", charge, paymentSelect);
    if (!payment) {
        throw new Error(`Stripe dispute ${disputeId} has no local payment`);
    }
    const status = stringAt(provider, "status") || "needs_response";
    const evidenceDetails = objectAt(provider, "evidence_details");
    const dueBy = numberAt(evidenceDetails, "due_by");
    const existingDispute = await getRowByField<StripeDisputeRow>(
        "stripe_disputes",
        "stripe_dispute_id",
        disputeId,
        disputeSelect,
    );
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

async function verifyStripeWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secretName: "STRIPE_WEBHOOK_SECRET" | "STRIPE_CONNECT_WEBHOOK_SECRET" | "STRIPE_CONNECT_V2_WEBHOOK_SECRET",
): Promise<void> {
    const fields = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
    const timestampText = fields.find(([key]) => key === "t")?.[1] ?? "";
    const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
    const timestamp = Number(timestampText);
    if (!Number.isSafeInteger(timestamp) || !signatures.length) {
        throw new HttpError(400, "invalid Stripe signature header");
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > stripeWebhookToleranceSeconds) {
        throw new HttpError(400, "stale Stripe webhook signature");
    }
    const secret = requiredEnv(secretName);
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestampText}.${rawBody}`));
    const expected = bytesToHex(new Uint8Array(mac));
    if (!signatures.some((signature) => safeEqual(signature, expected))) {
        throw new HttpError(400, "invalid Stripe webhook signature");
    }
}

function stripeEventCreatedAt(event: JsonRecord): string {
    if (Number.isSafeInteger(event.created)) {
        return new Date(Number(event.created) * 1000).toISOString();
    }
    if (typeof event.created === "string") {
        const timestamp = Date.parse(event.created);
        if (Number.isFinite(timestamp)) {
            return new Date(timestamp).toISOString();
        }
    }
    throw new HttpError(400, "Stripe event created timestamp is invalid");
}

function refundStatusFromStripe(refund: StripeRefund): string {
    switch (refund.status) {
        case "succeeded":
            return "succeeded";
        case "failed":
        case "canceled":
            return refund.status === "canceled" ? "cancelled" : "failed";
        case "pending":
        case "requires_action":
            return "pending";
        default:
            return "processing";
    }
}

function terminalDisputeStatus(status: string): boolean {
    return ["won", "lost", "warning_closed", "prevented"].includes(status);
}

function sanitizeDisputeEvidence(value: unknown): JsonRecord {
    if (!isRecord(value)) {
        throw new HttpError(400, "evidence must be an object");
    }
    const allowed = new Set([
        "access_activity_log",
        "billing_address",
        "cancellation_policy",
        "cancellation_policy_disclosure",
        "cancellation_rebuttal",
        "customer_communication",
        "customer_email_address",
        "customer_name",
        "customer_purchase_ip",
        "customer_signature",
        "duplicate_charge_documentation",
        "duplicate_charge_explanation",
        "duplicate_charge_id",
        "product_description",
        "receipt",
        "refund_policy",
        "refund_policy_disclosure",
        "refund_refusal_explanation",
        "service_date",
        "service_documentation",
        "shipping_address",
        "shipping_carrier",
        "shipping_date",
        "shipping_documentation",
        "shipping_tracking_number",
        "uncategorized_file",
        "uncategorized_text",
    ]);
    const sanitized: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
        if (!allowed.has(key)) {
            throw new HttpError(400, `unsupported Stripe evidence field: ${key}`);
        }
        if (typeof entry !== "string" || !entry.trim() || entry.length > 20_000) {
            throw new HttpError(400, `Stripe evidence field ${key} must be a non-empty string`);
        }
        if (
            [
                "customer_communication",
                "customer_signature",
                "duplicate_charge_documentation",
                "receipt",
                "service_documentation",
                "shipping_documentation",
                "uncategorized_file",
            ].includes(key) &&
            !entry.startsWith("file_")
        ) {
            throw new HttpError(400, `Stripe evidence field ${key} requires a Stripe file id`);
        }
        sanitized[key] = entry.trim();
    }
    if (!Object.keys(sanitized).length) {
        throw new HttpError(400, "at least one evidence field is required");
    }
    return sanitized;
}

function flattenDisputeEvidence(body: JsonRecord): JsonRecord {
    const evidence = isRecord(body.evidence) ? { ...body.evidence } : {};
    const mappings: Array<[string, string]> = [
        ["evidenceText", "uncategorized_text"],
        ["customerCommunicationFileId", "customer_communication"],
        ["shippingDocumentationFileId", "shipping_documentation"],
        ["shippingTrackingNumber", "shipping_tracking_number"],
        ["shippingDate", "shipping_date"],
        ["receiptFileId", "receipt"],
        ["productDescription", "product_description"],
        ["customerName", "customer_name"],
        ["customerEmailAddress", "customer_email_address"],
    ];
    for (const [input, provider] of mappings) {
        if (body[input] !== undefined && body[input] !== null && body[input] !== "") {
            evidence[provider] = body[input];
        }
    }
    return evidence;
}

function decodeBase64(value: string): Uint8Array {
    try {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        throw new HttpError(400, "base64 evidence is invalid");
    }
}
