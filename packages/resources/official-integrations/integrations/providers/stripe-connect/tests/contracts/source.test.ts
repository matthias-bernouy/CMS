import { afterAll, describe } from "bun:test";
import { registerAccountSourceScenarios } from "../accounts/source-scenarios/register";
import { registerSellerPayoutSourceScenarios } from "../accounts/source-scenarios/payout-schedule/register";
import { registerFinancialOperationRedactionScenario } from "../integration-contracts/dashboard/financial-operation-redaction.contracts";
import { registerPaymentCancellationSourceScenarios } from "../payments/cancellation/source-scenarios";
import {
    registerProtectedPaymentEligibilitySourceScenarios,
    registerProtectedPaymentSourceScenarios,
} from "../payments/source-scenarios/register";
import { registerDisputeApprovalSourceScenarios } from "../provider-boundary/dispute-approval/source-scenarios";
import { registerPlatformProtectionSourceScenarios } from "../provider-boundary/protected-payment/platform-protection/source-scenarios/register";
import { registerProtectedRefundSourceScenarios } from "../provider-boundary/protected-refund/success/source-scenarios/register";
import { registerDisputeRecoverySourceScenarios } from "../provider-reconciliation/payment-ledger/source-scenarios/disputes/register";
import { registerPaymentRecoverySourceScenarios } from "../provider-reconciliation/payment-ledger/source-scenarios/register";
import { registerPayoutSourceScenarios } from "../routing/webhooks/payout-scenarios/register";
import {
    registerWebhookRecoverySourceScenario,
    registerWebhookSourceScenarios,
} from "../routing/webhooks/source-scenarios/register";
import { registerStripeConnectBoundaryContracts } from "../routing/registrations/register";
import { registerRootSourceScenarios } from "../routing/registrations/source-scenarios/register";
import { installStripeConnectRuntime, restoreStripeConnectRuntime } from "../runtime/environment";
import { createStripeConnectHarness as createHarness } from "../runtime/harness";

installStripeConnectRuntime();

afterAll(() => {
    restoreStripeConnectRuntime();
});

describe("stripe-connect 1.0.0 source", () => {
    registerRootSourceScenarios(createHarness);

    registerProtectedPaymentSourceScenarios(createHarness);

    registerSellerPayoutSourceScenarios(createHarness);

    registerPlatformProtectionSourceScenarios(createHarness);

    registerProtectedPaymentEligibilitySourceScenarios(createHarness);

    registerProtectedRefundSourceScenarios(createHarness);

    registerDisputeRecoverySourceScenarios(createHarness);

    registerWebhookSourceScenarios(createHarness);

    registerPayoutSourceScenarios(createHarness);

    registerWebhookRecoverySourceScenario(createHarness);

    registerPaymentRecoverySourceScenarios(createHarness);

    registerPaymentCancellationSourceScenarios(createHarness);

    registerDisputeApprovalSourceScenarios(createHarness);

    registerFinancialOperationRedactionScenario(createHarness);

    registerAccountSourceScenarios(createHarness);
});

registerStripeConnectBoundaryContracts(createHarness);
