import { insertStripeEventDurably } from "./db/repositories/events-exceptions.ts";
import { platformPayoutControl, sellerRiskAccount } from "./domain/accounts/payout-control-state.ts";
import { terminalDisputeStatus } from "./domain/disputes/status.ts";
import { directStripeConnectHandlers } from "./http/direct-handlers.ts";
import { serveStripeConnect } from "./http/router.ts";
import { syncAccountForIdentity } from "./routes/accounts/sync.ts";
import { createAcceptStripeDispute } from "./routes/disputes/acceptance.ts";
import { createUploadStripeDisputeFile } from "./routes/disputes/files.ts";
import { requiredDispute } from "./routes/disputes/required.ts";
import { createStageStripeDisputeEvidence } from "./routes/disputes/staging.ts";
import { createSubmitStripeDisputeEvidence } from "./routes/disputes/submission.ts";
import { createProtectedPaymentRoutes } from "./routes/payments/protected.ts";
import { requiredPayment } from "./routes/payments/required.ts";
import { createRequestSettlementRelease } from "./routes/payments/settlement-release.ts";
import { createRequestTransferReversal } from "./routes/payments/transfer-reversal.ts";
import { createConfigurePlatformPayoutProtection } from "./routes/payouts/platform-protection.ts";
import { createConfigureSellerPayoutSchedule } from "./routes/payouts/seller-schedule.ts";
import { createReconcileProviderPayment } from "./routes/reconciliation/payment.ts";
import { createRunProviderReconciliation } from "./routes/reconciliation/run.ts";
import { createRequestProtectedRefund } from "./routes/refunds/protected.ts";
import { createRefundExecutionWorkflow } from "./workflows/refunds/execution.ts";
import { createRefundProjectionWorkflow } from "./workflows/refunds/projection.ts";
import { createProtectedRefundWorkflow } from "./workflows/refunds/protected.ts";
import { createProtectedPaymentWorkflow } from "./workflows/payments/creation/workflow.ts";
import { createSettlementReleaseWorkflow } from "./workflows/payments/settlement-release.ts";
import { createTransferReversalWorkflow } from "./workflows/payments/transfer-reversal/workflow.ts";
import { createSellerRecoveryPayoutHold } from "./workflows/payouts/seller-hold.ts";
import { createRecordSellerRecoveryExposure } from "./workflows/payouts/seller-exposure.ts";
import { createSellerPayoutRestoration } from "./workflows/payouts/seller-restoration.ts";
import { createStripeDisputeApplication } from "./workflows/disputes/application.ts";
import { authorizeIrreversibleDisputeAction } from "./workflows/disputes/authorization.ts";
import { createPaymentReconciliationWorkflow } from "./workflows/reconciliation/payment.ts";
import { createPaymentOperationRecovery } from "./workflows/reconciliation/operations/payment.ts";
import { createPayoutScheduleOperationRecovery } from "./workflows/reconciliation/operations/payout-schedule.ts";
import { createFinancialOperationRecovery } from "./workflows/reconciliation/operations/dispatcher.ts";
import { createProviderObjectReconciliation } from "./workflows/reconciliation/provider-objects.ts";
import { createAccountPayoutHoldReconciliation } from "./workflows/reconciliation/account-holds.ts";
import { createProviderReconciliationRun } from "./workflows/reconciliation/run.ts";
import { createStripeWebhookIngress } from "./workflows/webhooks/ingress.ts";
import { createStripeEventProcessor } from "./workflows/webhooks/processing.ts";
import { moveOperationToManualReview } from "./workflows/operations/manual-review.ts";

const createProtectedPaymentForBuyer = createProtectedPaymentWorkflow({ syncAccountForIdentity });
const {
    checkSellerHeldPaymentEligibility,
    listSellerHeldPaymentCapabilities,
    createProtectedPayment,
    getProtectedPayment,
    getProtectedPaymentByReference,
} = createProtectedPaymentRoutes({ createProtectedPaymentForBuyer, syncAccountForIdentity });
const { applyClaimedSellerRecoveryPayoutHold, enforceSellerRecoveryPayoutHold } = createSellerRecoveryPayoutHold({
    sellerRiskAccount,
});
const recordSellerRecoveryExposure = createRecordSellerRecoveryExposure({ enforceSellerRecoveryPayoutHold });
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
const restoreSellerAutomaticPayoutSchedule = createSellerPayoutRestoration({
    sellerRiskAccount,
    applyClaimedSellerRecoveryPayoutHold,
});
const reconcileAccountPayoutHolds = createAccountPayoutHoldReconciliation({
    enforceSellerRecoveryPayoutHold,
    restoreSellerAutomaticPayoutSchedule,
});
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
const processClaimedFinancialOperation = createFinancialOperationRecovery({
    recoverPayoutScheduleOperation,
    recoverPaymentOperation,
});
const executeProviderReconciliationRun = createProviderReconciliationRun({
    moveOperationToManualReview,
    processClaimedFinancialOperation,
    processStripeEvent,
    reconcileAccountPayoutHolds,
    reconcilePayment,
});
const runProviderReconciliation = createRunProviderReconciliation({ executeProviderReconciliationRun });
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
    ...directStripeConnectHandlers,
    checkSellerHeldPaymentEligibility,
    listSellerHeldPaymentCapabilities,
    createProtectedPayment,
    getProtectedPayment,
    getProtectedPaymentByReference,
    requestSettlementRelease,
    requestTransferReversal,
    requestProtectedRefund,
    reconcileProviderPayment,
    runProviderReconciliation,
    configurePlatformPayoutProtection,
    configureSellerPayoutSchedule,
    uploadStripeDisputeFile,
    stageStripeDisputeEvidence,
    submitStripeDisputeEvidence,
    acceptStripeDispute,
});
