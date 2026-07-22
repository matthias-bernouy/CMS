import { afterAll, describe } from "bun:test";
import { registerAccountSourceScenarios } from "./stripe-connect/accounts/source-scenarios/register";
import { registerSellerPayoutSourceScenarios } from "./stripe-connect/accounts/source-scenarios/payout-schedule/register";
import { registerFinancialOperationRedactionScenario } from "./stripe-connect/dashboard/financial-operation-redaction.contracts";
import { registerPaymentCancellationSourceScenarios } from "./stripe-connect/payments/cancellation/source-scenarios";
import {
    registerProtectedPaymentEligibilitySourceScenarios,
    registerProtectedPaymentSourceScenarios,
} from "./stripe-connect/payments/source-scenarios/register";
import { registerDisputeApprovalSourceScenarios } from "./stripe-connect/provider-boundary/dispute-approval/source-scenarios";
import { registerPlatformProtectionSourceScenarios } from "./stripe-connect/provider-boundary/protected-payment/platform-protection/source-scenarios/register";
import { registerProtectedRefundSourceScenarios } from "./stripe-connect/provider-boundary/protected-refund/success/source-scenarios/register";
import { registerDisputeRecoverySourceScenarios } from "./stripe-connect/provider-reconciliation/payment-ledger/source-scenarios/disputes/register";
import { registerPaymentRecoverySourceScenarios } from "./stripe-connect/provider-reconciliation/payment-ledger/source-scenarios/register";
import { registerPayoutSourceScenarios } from "./stripe-connect/routing/webhooks/payout-scenarios/register";
import {
    registerWebhookRecoverySourceScenario,
    registerWebhookSourceScenarios,
} from "./stripe-connect/routing/webhooks/source-scenarios/register";
import { registerStripeConnectBoundaryContracts } from "./stripe-connect/routing/registrations/register";
import { registerRootSourceScenarios } from "./stripe-connect/routing/registrations/source-scenarios/register";
import { installStripeConnectRuntime, restoreStripeConnectRuntime } from "./stripe-connect/runtime/environment";
import { createStripeConnectHarness as createHarness } from "./stripe-connect/runtime/harness";

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
