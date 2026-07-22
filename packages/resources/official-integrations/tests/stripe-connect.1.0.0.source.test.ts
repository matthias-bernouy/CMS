import { afterAll, describe, expect, test } from "bun:test";
import { USER_ROLE } from "@bernouy/cms-permissions";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { registerAccountEnrollmentContracts } from "./stripe-connect/accounts/enrollment.contracts";
import { registerAccountLifecycleContracts } from "./stripe-connect/accounts/lifecycle.contracts";
import { registerAccountOnboardingContracts } from "./stripe-connect/accounts/onboarding.contracts";
import { registerSellerPayoutSourceScenarios } from "./stripe-connect/accounts/source-scenarios/payout-schedule/register";
import { registerAccountSourceScenarios } from "./stripe-connect/accounts/source-scenarios/register";
import { registerPayoutScheduleConcurrencyContracts } from "./stripe-connect/accounts/payout-schedule/concurrency";
import { registerPayoutScheduleContracts } from "./stripe-connect/accounts/payout-schedule/contracts";
import { registerPayoutScheduleFailureContracts } from "./stripe-connect/accounts/payout-schedule/failures";
import { registerPayoutScheduleCleanupContracts } from "./stripe-connect/accounts/payout-schedule/cleanup";
import { registerPayoutScheduleRiskContracts } from "./stripe-connect/accounts/payout-schedule/risk";
import { registerPayoutScheduleValidationContracts } from "./stripe-connect/accounts/payout-schedule/validation";
import { registerOperationAndExceptionDashboardContracts } from "./stripe-connect/dashboard/operations-exceptions.contracts";
import { registerPaymentDashboardContracts } from "./stripe-connect/dashboard/payments.contracts";
import { registerPaymentProjectionContracts } from "./stripe-connect/payments/projection/contracts";
import { registerPaymentProjectionFailureContracts } from "./stripe-connect/payments/projection/failures";
import { registerPaymentProjectionReplayContracts } from "./stripe-connect/payments/projection/replay";
import { registerPaymentCancellationFailureContracts } from "./stripe-connect/payments/cancellation/failures.contracts";
import { registerPaymentCancellationRecoveryContracts } from "./stripe-connect/payments/cancellation/recovery.contracts";
import { registerPaymentCancellationReplayContracts } from "./stripe-connect/payments/cancellation/replay.contracts";
import { registerPaymentCancellationReservationContracts } from "./stripe-connect/payments/cancellation/reservation.contracts";
import { registerAccountProviderBoundaryContracts } from "./stripe-connect/provider-boundary/accounts.contracts";
import { registerDisputeFileProviderBoundaryContracts } from "./stripe-connect/provider-boundary/dispute-writes/files.contracts";
import { registerDisputeStagingContracts } from "./stripe-connect/provider-boundary/dispute-writes/staging.contracts";
import { registerDisputeApplicationReadContextContracts } from "./stripe-connect/provider-boundary/dispute-application/read-context.contracts";
import { registerDisputeApprovalContracts } from "./stripe-connect/provider-boundary/dispute-approval/approval.contracts";
import { registerDisputeApprovalCompletionContracts } from "./stripe-connect/provider-boundary/dispute-approval/completion.contracts";
import { registerDisputeApprovalFailureContracts } from "./stripe-connect/provider-boundary/dispute-approval/failures.contracts";
import { registerDisputeApprovalSubmissionContracts } from "./stripe-connect/provider-boundary/dispute-approval/submission.contracts";
import { registerProtectedPaymentFailureContracts } from "./stripe-connect/provider-boundary/protected-payment/failures.contracts";
import { registerPlatformPayoutProtectionFailureContracts } from "./stripe-connect/provider-boundary/protected-payment/platform-protection/failures.contracts";
import { registerPlatformPayoutProtectionValidationContracts } from "./stripe-connect/provider-boundary/protected-payment/platform-protection/validation.contracts";
import { registerPlatformPayoutProtectionWorkflowContracts } from "./stripe-connect/provider-boundary/protected-payment/platform-protection/workflow.contracts";
import { registerProtectedPaymentPayoutContracts } from "./stripe-connect/provider-boundary/protected-payment/payout.contracts";
import { registerProtectedPaymentProjectionRaceContracts } from "./stripe-connect/provider-boundary/protected-payment/projection-races.contracts";
import { registerProtectedPaymentReservationContracts } from "./stripe-connect/provider-boundary/protected-payment/reservation.contracts";
import { registerProtectedPaymentReplayContracts } from "./stripe-connect/provider-boundary/protected-payment/replay.contracts";
import { registerProtectedRefundFailureContracts } from "./stripe-connect/provider-boundary/protected-refund/failures.contracts";
import { registerProtectedRefundRecoveryContracts } from "./stripe-connect/provider-boundary/protected-refund/recovery.contracts";
import { registerProtectedRefundReplayContracts } from "./stripe-connect/provider-boundary/protected-refund/replay.contracts";
import { registerProtectedRefundSellerRecoveryContracts } from "./stripe-connect/provider-boundary/protected-refund/seller-recovery.contracts";
import { registerProtectedRefundSuccessContracts } from "./stripe-connect/provider-boundary/protected-refund/success/contracts";
import { registerProtectedRefundProjectionInterleavingContracts } from "./stripe-connect/provider-boundary/protected-refund/success/projection-interleavings.contracts";
import { registerProtectedRefundProjectionStatusContracts } from "./stripe-connect/provider-boundary/protected-refund/success/projection-statuses.contracts";
import { registerProtectedRefundPreflightInterleavingContracts } from "./stripe-connect/provider-boundary/protected-refund/success/preflight-interleavings.contracts";
import { registerProtectedRefundValidationContracts } from "./stripe-connect/provider-boundary/protected-refund/validations.contracts";
import { registerTransferReversalCompletionSnapshotContracts } from "./stripe-connect/provider-boundary/transfer-reversal/completion-snapshots.contracts";
import { registerTransferReversalFailureContracts } from "./stripe-connect/provider-boundary/transfer-reversal/failures.contracts";
import { registerTransferReversalRecoveryContracts } from "./stripe-connect/provider-boundary/transfer-reversal/recovery.contracts";
import { registerTransferReversalSuccessContracts } from "./stripe-connect/provider-boundary/transfer-reversal/success.contracts";
import { registerAccountTermsRepositoryContracts } from "./stripe-connect/repository-boundary/accounts-terms.contracts";
import { registerLedgerRepositoryContracts } from "./stripe-connect/repository-boundary/ledger.contracts";
import { registerPaymentOperationRepositoryContracts } from "./stripe-connect/repository-boundary/payments-operations.contracts";
import { registerProtectedPaymentEligibilityContracts } from "./stripe-connect/repository-boundary/protected-payment-eligibility.contracts";
import { registerProviderReconciliationBudgets } from "./stripe-connect/provider-reconciliation/budgets";
import { registerProviderReconciliationContracts } from "./stripe-connect/provider-reconciliation/contracts";
import { registerProviderExceptionResolutionContracts } from "./stripe-connect/provider-reconciliation/exception-resolution";
import { registerStripeConnectRoutingContracts } from "./stripe-connect/routing/contracts";
import { registerProtectedPaymentReadContracts } from "./stripe-connect/routing/protected-payment-reads.contracts";
import { registerProtectedPaymentValidationContracts } from "./stripe-connect/routing/protected-payment-validations.contracts";
import { registerProviderReconciliationRunRoutingContracts } from "./stripe-connect/routing/reconciliation-run.contracts";
import { registerStripeWebhookPersistenceContracts } from "./stripe-connect/routing/webhooks/persistence.contracts";
import { registerPayoutSourceScenarios } from "./stripe-connect/routing/webhooks/payout-scenarios/register";
import { registerStripeWebhookCoreProcessingContracts } from "./stripe-connect/routing/webhooks/processing-core.contracts";
import { registerStripeWebhookMoneyProcessingContracts } from "./stripe-connect/routing/webhooks/processing-money.contracts";
import { registerStripeWebhookValidationContracts } from "./stripe-connect/routing/webhooks/validation.contracts";
import { registerPaymentReconciliationLedgerContracts } from "./stripe-connect/provider-reconciliation/payment-ledger/contracts";
import { registerPaymentReconciliationLedgerDivergenceContracts } from "./stripe-connect/provider-reconciliation/payment-ledger/divergence";
import { registerPaymentReconciliationProviderFailureContracts } from "./stripe-connect/provider-reconciliation/payment-ledger/provider-failures.contracts";
import { registerDisputeRecoverySourceScenarios } from "./stripe-connect/provider-reconciliation/payment-ledger/source-scenarios/disputes/register";
import { registerPaymentRecoverySourceScenarios } from "./stripe-connect/provider-reconciliation/payment-ledger/source-scenarios/register";
import { registerStalePaymentLocalContextContracts } from "./stripe-connect/provider-reconciliation/payment-ledger/stale-local-context";
import { registerStalePaymentLocalContextFailureContracts } from "./stripe-connect/provider-reconciliation/payment-ledger/stale-local-context-failures";
import { registerProviderTransferContextContracts } from "./stripe-connect/provider-reconciliation/provider-transfer-context/contracts";
import { registerProviderTransferContextFailureContracts } from "./stripe-connect/provider-reconciliation/provider-transfer-context/failures";
import { registerTerminalOperationRecoveryContracts } from "./stripe-connect/provider-reconciliation/operation-recovery/terminal-contracts";
import { registerSettlementReleaseFailureContracts } from "./stripe-connect/provider-reconciliation/operation-recovery/settlement-release/failures.contracts";
import { registerSettlementReleaseRecoveryContracts } from "./stripe-connect/provider-reconciliation/operation-recovery/settlement-release/recovery.contracts";
import { registerSettlementReleaseReadOrderContracts } from "./stripe-connect/provider-reconciliation/operation-recovery/settlement-release/read-order.contracts";
import { registerSettlementReleaseLedgerFreshnessContracts } from "./stripe-connect/provider-reconciliation/operation-recovery/settlement-release/ledger-freshness.contracts";
import { registerSettlementReleaseReplayContracts } from "./stripe-connect/provider-reconciliation/operation-recovery/settlement-release/replay.contracts";
import { registerSettlementReleaseValidationContracts } from "./stripe-connect/provider-reconciliation/operation-recovery/settlement-release/validations.contracts";
import { registerPaymentReconciliationRoutingContracts } from "./stripe-connect/routing/payment-reconciliation.contracts";
import { registerRefundAndDisputeDashboardContracts } from "./stripe-connect/dashboard/refunds-disputes.contracts";
import {
    financialTermsHash,
    functionsBaseUrl,
    isoTimestampPattern,
    marketplaceTermsHash,
} from "./stripe-connect/runtime/constants";
import {
    activeEnv,
    installStripeConnectRuntime,
    restoreStripeConnectRuntime,
} from "./stripe-connect/runtime/environment";
import { jsonBody, okJson, stripeSignature } from "./stripe-connect/runtime/http";
import {
    createStripeConnectHarness as createHarness,
    type StripeConnectHarness as Harness,
} from "./stripe-connect/runtime/harness";
import { same } from "./stripe-connect/runtime/records";
import {
    sourceJson,
    sourceJsonWithRole,
    sourceJsonWithUser,
    sourceRequest,
    sourceRequestWithRole,
    sourceRequestWithUser,
} from "./stripe-connect/runtime/source-requests";
import type { JsonRecord } from "./stripe-connect/runtime/types";

installStripeConnectRuntime();

afterAll(() => {
    restoreStripeConnectRuntime();
});

describe("stripe-connect 1.0.0 source", () => {
    test("persists seller recovery exposure and blocks payments, releases, and unsafe payouts", async () => {
        const root = resolve(import.meta.dir, "../integrations/stripe-connect/versions/1.0.0");
        const [schema, edge, paymentProjection, definition] = await Promise.all([
            readFile(resolve(root, "connectors/supabase/schema.sql"), "utf8"),
            Promise.all([
                readFile(resolve(root, "connectors/supabase/functions/cms-stripe-connect/index.ts"), "utf8"),
                readFile(
                    resolve(root, "connectors/supabase/functions/cms-stripe-connect/routes/payouts/seller-schedule.ts"),
                    "utf8",
                ),
                readFile(
                    resolve(
                        root,
                        "connectors/supabase/functions/cms-stripe-connect/workflows/payments/settlement-release.ts",
                    ),
                    "utf8",
                ),
                readFile(
                    resolve(
                        root,
                        "connectors/supabase/functions/cms-stripe-connect/workflows/payouts/seller-exposure.ts",
                    ),
                    "utf8",
                ),
            ]).then((sources) => sources.join("\n")),
            readFile(
                resolve(
                    root,
                    "connectors/supabase/functions/cms-stripe-connect/workflows/payments/projection-builders.ts",
                ),
                "utf8",
            ),
            readFile(resolve(root, "definition.json"), "utf8"),
        ]);

        expect(schema).toContain("stripe_connect.seller_recovery_exposures");
        expect(schema).toContain("stripe_connect.transfer_recovery_requests");
        expect(schema).toContain("reserve_transfer_recovery");
        expect(schema).toContain("exit when v_index >= 23");
        expect(schema).toContain("outstanding_debt_amount bigint not null default 0");
        expect(schema).toContain("upsert_seller_recovery_exposure_and_refresh");
        expect(schema).toContain("claim_seller_payout_hold");
        expect(schema).toContain("finalize_seller_payout_configuration");
        expect(schema).toContain("recover_transient_provider_truth_review");
        expect(schema).toContain("provider_payment_truth_revalidated");
        expect(schema).toContain("on stripe_connect.provider_exceptions(deduplication_key);");
        expect(schema).toContain("index_definition.indpred is not null");
        expect(schema).toContain("hashtextextended('stripe-connect-seller-risk:'");
        expect(schema).toContain(
            "actor_kind in ('system', 'webhook', 'reconciliation', 'support', 'finance', 'admin')",
        );
        expect(schema).toContain("first_actor_kind in ('finance', 'admin')");
        expect(schema).toContain("second_actor_kind in ('finance', 'admin')");
        expect(schema).toContain("if p_actor_kind is distinct from 'admin'");
        expect(edge).toContain("recordSellerRecoveryExposure");
        expect(edge).toContain("Their outage must");
        expect(edge).toContain("payout schedule change was superseded by seller financial risk");
        expect(edge).toContain("seller financial risk blocks settlement release");
        expect(edge).toContain("seller financial exposure requires a manual payout hold");
        expect(paymentProjection).toContain("settlementStatus: payment.settlement_status");
        expect(paymentProjection).toContain("manualReviewReason: payment.manual_review_reason");
        expect(edge).not.toContain('route === "/operations/refund"');
        expect(definition).not.toContain('"endpointId": "requestRefund"');
    });

    test("does not expose arbitrary Connect account lookup to anonymous or support callers", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:stripe-connect");
        expect(source?.endpoints.map((endpoint) => endpoint.urn)).not.toContain("urn:stripe-connect:getConnectAccount");
        expect(
            source?.endpoints.find((endpoint) => endpoint.urn === "urn:stripe-connect:submitConnectVerification")
                ?.timeoutMs,
        ).toBe(60_000);

        const endpoint = (id: string) =>
            source?.endpoints.find((candidate) => candidate.urn === `urn:stripe-connect:${id}`);
        const protectedPayment = endpoint("createProtectedPayment");
        const heldPaymentEligibility = endpoint("checkSellerHeldPaymentEligibility");
        const sellerRisk = endpoint("getSellerProviderRisk");
        const sellerPayout = endpoint("configureSellerPayoutSchedule");
        const reconciliationPaymentOutput =
            endpoint("runProviderReconciliation")?.output?.[0]?.body?.properties?.payments?.items;
        const enrollment = endpoint("enrollConnectSeller");
        const protectedPaymentOutput = protectedPayment?.output?.[0]?.body;
        const protectedPaymentRead = endpoint("getProtectedPayment");
        const protectedPaymentReference = endpoint("getProtectedPaymentByClientReference");
        const protectedPaymentReadOutput = protectedPaymentRead?.output?.[0]?.body;
        const protectedPaymentReferenceOutput = protectedPaymentReference?.output?.[0]?.body;
        expect(enrollment?.timeoutMs).toBe(60_000);
        expect(reconciliationPaymentOutput?.properties?.commercePaymentStatus).toEqual({ type: "string" });
        expect(reconciliationPaymentOutput?.required).toContain("commercePaymentStatus");
        expect(protectedPaymentReadOutput?.properties?.reconciliationPending).toEqual({ type: "boolean" });
        expect(protectedPaymentReferenceOutput?.properties?.payment?.properties?.reconciliationPending).toEqual({
            type: "boolean",
        });
        expect(protectedPaymentRead?.access).toEqual({ mode: "system" });
        expect(protectedPaymentReference?.access).toEqual({ mode: "system" });
        expect(enrollment?.input?.body?.required ?? []).toEqual([]);
        expect(Object.keys(enrollment?.input?.body?.properties ?? {})).toEqual([
            "accountToken",
            "contactEmail",
            "marketplaceTermsAccepted",
            "marketplaceTermsVersion",
            "marketplaceTermsHash",
        ]);
        expect(endpoint("getConnectStatus")?.input?.params?.map((param) => param.name)).toEqual([
            "marketplaceTermsVersion",
            "marketplaceTermsHash",
        ]);
        expect(endpoint("getConnectStatus")?.output?.[0]?.body?.properties?.marketplaceTermsAcceptedAt).toEqual({
            type: "string",
            nullable: true,
        });
        expect(endpoint("getConnectStatus")?.output?.[0]?.body?.properties?.stripeAccountId).toEqual({
            type: "string",
            nullable: true,
        });
        expect([
            protectedPayment?.input?.body?.properties?.sellerUserId?.semantic?.authority,
            heldPaymentEligibility?.input?.body?.properties?.sellerUserId?.semantic?.authority,
            sellerRisk?.input?.params?.[0]?.schema?.semantic?.authority,
            sellerPayout?.input?.body?.properties?.userId?.semantic?.authority,
            endpoint("createConnectOnboardingLinkForUser")?.input?.params?.[0]?.schema?.semantic?.authority,
            endpoint("createConnectOnboardingSessionForUser")?.input?.params?.[0]?.schema?.semantic?.authority,
            endpoint("getConnectStatus")?.output?.[0]?.body?.properties?.userId?.semantic?.authority,
            endpoint("enrollConnectSeller")?.output?.[0]?.body?.properties?.userId?.semantic?.authority,
            protectedPaymentOutput?.properties?.buyerUserId?.semantic?.authority,
            protectedPaymentOutput?.properties?.sellerUserId?.semantic?.authority,
            protectedPaymentReadOutput?.properties?.buyerUserId?.semantic?.authority,
            protectedPaymentReadOutput?.properties?.sellerUserId?.semantic?.authority,
            protectedPaymentReferenceOutput?.properties?.payment?.properties?.buyerUserId?.semantic?.authority,
            protectedPaymentReferenceOutput?.properties?.payment?.properties?.sellerUserId?.semantic?.authority,
            sellerRisk?.output?.[0]?.body?.properties?.account?.properties?.userId?.semantic?.authority,
            sellerPayout?.output?.[0]?.body?.properties?.account?.properties?.userId?.semantic?.authority,
        ]).toEqual(Array(16).fill("cms"));
        expect(heldPaymentEligibility?.access).toEqual({ mode: "system" });
        expect(heldPaymentEligibility?.output?.[0]?.body).toMatchObject({
            type: "object",
            properties: { eligible: { type: "boolean" }, reasonCode: { type: "string" } },
            required: ["eligible", "reasonCode"],
        });

        const anonymousSourceLookup = await sourceRequestWithRole(harness, "", undefined, "getConnectAccount", {
            userId: "seller-1",
        });
        const anonymousEdgeLookup = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/accounts/account?userId=seller-1`),
        );
        const supportEdgeLookup = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/accounts/account?userId=seller-1`, {
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
                    "x-cms-user-id": "support-1",
                    "x-cms-user-role": "support",
                },
            }),
        );

        expect(anonymousSourceLookup.status).toBe(404);
        expect(anonymousEdgeLookup.status).toBe(404);
        expect(supportEdgeLookup.status).toBe(404);
    });

    test("projects nullable status fields for an existing seller account", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                    country: "FR",
                },
                { userId: "seller-1" },
            ),
        );

        harness.rest.setAccountState("seller-1", { marketplace_terms_accepted_at: null });
        const termsPending = await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectStatus"));
        expect(termsPending).toMatchObject({
            exists: true,
            connected: true,
            stripeAccountId: expect.any(String),
            marketplaceTermsAcceptedAt: null,
        });

        harness.rest.setAccountState("seller-1", { stripe_account_id: null });
        const accountPending = await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectStatus"));
        expect(accountPending).toMatchObject({
            exists: true,
            connected: false,
            stripeAccountId: null,
            marketplaceTermsAcceptedAt: null,
        });
    });

    test("fails before mutation when Stripe secret and publishable key modes diverge", async () => {
        const harness = await createHarness();
        const originalSecret = activeEnv.STRIPE_SECRET_KEY;
        const originalPublishable = activeEnv.STRIPE_PUBLISHABLE_KEY;
        try {
            activeEnv.STRIPE_SECRET_KEY = "sk_test_mode_guard";
            activeEnv.STRIPE_PUBLISHABLE_KEY = "pk_live_mode_guard";
            const mismatched = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/connect/config`, {
                    headers: {
                        authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
                        "x-user-id": "buyer-mode-guard",
                    },
                }),
            );
            expect(mismatched.status).toBe(500);
            expect(await mismatched.json()).toEqual({
                error: "Stripe secret and publishable keys must use the same explicit test or live mode",
            });
            expect(harness.rest.rows("accounts")).toHaveLength(0);
            expect(harness.rest.rows("payments")).toHaveLength(0);
        } finally {
            activeEnv.STRIPE_SECRET_KEY = originalSecret;
            activeEnv.STRIPE_PUBLISHABLE_KEY = originalPublishable;
        }
    });

    test("rejects livemode mismatch on every signed Stripe webhook boundary", async () => {
        const harness = await createHarness();
        const created = Math.floor(Date.now() / 1000);
        const cases = [
            {
                route: "stripe",
                secret: "whsec_test_123",
                event: {
                    id: "evt_live_platform_mismatch",
                    type: "payment_intent.created",
                    api_version: "2026-02-25.clover",
                    created,
                    livemode: true,
                    data: { object: { id: "pi_live_mismatch" } },
                },
            },
            {
                route: "stripe-connect",
                secret: "whsec_connect_test_456",
                event: {
                    id: "evt_live_connect_mismatch",
                    type: "payout.created",
                    api_version: "2026-02-25.clover",
                    created,
                    livemode: true,
                    account: "acct_live_mismatch",
                    data: { object: { id: "po_live_mismatch" } },
                },
            },
            {
                route: "stripe-connect-v2",
                secret: "whsec_connect_v2_test_789",
                event: {
                    id: "evt_live_connect_v2_mismatch",
                    type: "v2.core.account.updated",
                    created,
                    livemode: true,
                    related_object: { type: "v2.core.account", id: "acct_live_v2_mismatch" },
                    data: { object: {} },
                },
            },
        ];
        for (const item of cases) {
            const payload = JSON.stringify(item.event);
            const signature = await stripeSignature(payload, item.secret);
            const response = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/${item.route}`, {
                    method: "POST",
                    headers: { "stripe-signature": signature },
                    body: payload,
                }),
            );
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({
                error: "Stripe webhook livemode does not match configured API keys",
            });
        }
        expect(harness.rest.rows("stripe_events")).toHaveLength(0);
    });

    test("creates a protected platform payment and strictly replays immutable terms", async () => {
        const harness = await createHarness();

        const config = await okJson(await sourceRequest(harness, "getConnectClientConfig"));
        const initial = await okJson(await sourceRequest(harness, "getConnectStatus"));
        const sellerSession = await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                    country: "FR",
                },
                { userId: "seller-1" },
            ),
        );
        const payment = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: "1200",
                sellerTransferAmount: "1080",
                currency: "EUR",
                clientReferenceId: "order-1",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
                description: "Order 1",
            }),
        );
        const repeated = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: "1200",
                sellerTransferAmount: "1080",
                currency: "EUR",
                clientReferenceId: "order-1",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
                description: "Order 1",
            }),
        );
        const mismatch = await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1201,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "order-1",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        });
        const listedPayments = await okJson(
            await sourceRequest(harness, "listProviderPayments", { q: "order", limit: "20" }),
        );
        const fetched = await okJson(
            await sourceRequest(harness, "getProtectedPayment", { paymentId: String(payment.paymentId) }),
        );
        const fetchedByReference = await okJson(
            await sourceRequest(harness, "getProtectedPaymentByClientReference", { clientReferenceId: "order-1" }),
        );
        const missingByReference = await okJson(
            await sourceRequest(harness, "getProtectedPaymentByClientReference", {
                clientReferenceId: "order-missing",
            }),
        );
        const hiddenByReference = await okJson(
            await sourceRequestWithUser(harness, "another-buyer", "getProtectedPaymentByClientReference", {
                clientReferenceId: "order-1",
            }),
        );
        const dashboard = await harness.dashboards.getDashboard("stripe-connect-dashboard");
        const userRole = await harness.roles.get(USER_ROLE);

        expect(config).toEqual({ publishableKey: "pk_test_123" });
        expect(initial).toMatchObject({
            exists: false,
            userId: "user-123",
            connected: false,
            onboardingStatus: "not_started",
        });
        expect(sellerSession).toMatchObject({
            exists: true,
            userId: "seller-1",
            connected: true,
            onboardingStatus: "onboarding_started",
            chargesEnabled: false,
            payoutsEnabled: true,
            clientSecret: "as_seller-1_secret",
        });
        expect(payment).toMatchObject({
            clientReferenceId: "order-1",
            buyerUserId: "user-123",
            sellerUserId: "seller-1",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            platformRetainedAmount: 120,
            paymentStatus: "created",
            settlementStatus: "held",
            financialTermsHash,
            stripePaymentIntentId: "pi_1",
            clientSecret: "pi_1_secret",
        });
        expect(repeated.paymentId).toBe(payment.paymentId);
        expect(harness.rest.paymentIntentCreateCount).toBe(1);
        expect(mismatch.status).toBe(409);
        expect(await jsonBody(mismatch)).toEqual({
            error: "protected payment replay does not match immutable financial terms",
        });
        expect(listedPayments.payments).toEqual([
            expect.objectContaining({ clientReferenceId: "order-1", stripePaymentIntentId: "pi_1" }),
        ]);
        expect(fetched).toMatchObject({
            paymentId: payment.paymentId,
            clientReferenceId: "order-1",
            reconciliationPending: false,
        });
        expect(fetchedByReference).toMatchObject({
            exists: true,
            payment: {
                paymentId: payment.paymentId,
                clientReferenceId: "order-1",
                commercePaymentStatus: "created",
                reconciliationPending: false,
            },
        });
        expect(missingByReference).toEqual({ exists: false });
        expect(hiddenByReference).toEqual({ exists: false });
        expect(harness.rest.rows("payments")).toHaveLength(1);
        expect(dashboard).toBeNull();
        const userPermissions = userRole?.grants.map((grant) => grant.permission) ?? [];
        expect(userPermissions).toEqual(
            expect.arrayContaining([
                "urn:stripe-connect:getConnectClientConfig",
                "urn:stripe-connect:getConnectStatus",
                "urn:stripe-connect:getConnectWallet",
                "urn:stripe-connect:enrollConnectSeller",
                "urn:stripe-connect:submitConnectVerification",
                "urn:stripe-connect:createOnboardingLink",
                "urn:stripe-connect:createOnboardingSession",
            ]),
        );
        expect(userPermissions).not.toContain("urn:stripe-connect:getProtectedPayment");
        expect(userPermissions).not.toContain("urn:stripe-connect:getProtectedPaymentByClientReference");
        expect(harness.importedBlocs[0]?.viewJS).toContain("Activer mes versements");
        expect(harness.importedBlocs[0]?.viewJS).toContain("submitConnectVerification");
        expect(harness.importedBlocs[0]?.viewJS).toContain('requestAccountSource("getAccount")');
        expect(harness.importedBlocs[0]?.viewJS).toContain('requestAuthSource("me")');
        expect(harness.importedBlocs[0]?.viewJS).toContain("currentAccount?.subject?.email");
        expect(harness.importedBlocs[0]?.viewJS).toContain('|| "system-auth"');
        expect(harness.importedBlocs[0]?.viewJS).toContain('requestStripeSource("getConnectWallet")');
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("seller-eligibility-function-id");
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("seller-sync-function-id");
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("synchronizeSellerEligibility");
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("system-functions");
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("createConnectPayout");
        expect(harness.importedBlocs[0]?.editorJS).not.toContain("Payout button");
        expect(harness.importedBlocs[0]?.viewJS).toContain("Complète les informations suivantes");
        expect(harness.importedBlocs[0]?.viewJS).toContain("Nous ne conservons pas ton IBAN");
        expect(harness.importedBlocs[0]?.viewJS).toContain('Intl.NumberFormat("fr-FR"');
        expect(harness.importedBlocs[0]?.viewJS).toContain("--wallet-accent");
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("CmsCore receives it");
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("Stripe must verify");
        expect(harness.importedBlocs[0]?.viewJS).not.toContain('"given-name"');
        expect(harness.importedBlocs[0]?.viewJS).not.toContain('"address-line1"');
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("Date of birth");
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("source-prefix");
        expect(harness.importedBlocs[0]?.viewJS).not.toContain("account-onboarding");
        expect(harness.importedBlocs[0]?.editorJS).toContain("User Account source");
        expect(harness.importedBlocs[0]?.editorJS).toContain("Authentication source");
        expect(harness.importedBlocs[0]?.editorJS).toContain('type: "color"');
        expect(harness.importedBlocs[0]?.editorJS).toContain("IBAN privacy notice");
        expect(harness.importedBlocs[0]?.editorJS).not.toContain("address-line1");
        expect(harness.rest.lastPaymentIntentParameters?.has("transfer_data[destination]")).toBeFalse();
        expect(harness.rest.lastPaymentIntentParameters?.has("application_fee_amount")).toBeFalse();
        expect(harness.rest.lastPaymentIntentParameters?.has("on_behalf_of")).toBeFalse();
    });

    test("keeps payment creation and admin payment reads on their provider boundaries", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );

        harness.rest.clearStripeRequests();
        const creationResponse = await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "provider-boundary-order",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        });
        expect(creationResponse.status).toBe(200);
        const created = await jsonBody(creationResponse);
        const transferGroup = "cms_order_068ccc3b0562834d11de0cd73aa06bcc945b494427cc05d88e974850a075ce15";
        expect(created.lastProviderSyncAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(created).toEqual({
            paymentId: 1,
            providerPaymentId: 1,
            clientReferenceId: "provider-boundary-order",
            financialTermsHash,
            financialRevision: 1,
            dualApprovalThresholdAmount: 1000,
            buyerUserId: "user-123",
            sellerUserId: "seller-1",
            stripePaymentIntentId: "pi_1",
            stripeChargeId: null,
            providerEventId: null,
            transferGroup,
            currency: "eur",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            platformRetainedAmount: 120,
            refundedAmount: 0,
            transferredAmount: 0,
            reversedAmount: 0,
            stripeChargeBalanceTransactionId: null,
            actualStripeChargeFeeAmount: 0,
            actualStripeRefundFeeAmount: 0,
            actualStripeProcessingFeeAmount: 0,
            actualStripeChargeNetAmount: null,
            actualStripeFeeCurrency: null,
            actualStripeChargeFeeDetails: [],
            actualPlatformMarginAfterStripeAmount: 120,
            paymentStatus: "created",
            commercePaymentStatus: "created",
            settlementStatus: "held",
            disputeStatus: "none",
            manualReviewReason: null,
            paidAt: null,
            cancelledAt: null,
            lastProviderSyncAt: created.lastProviderSyncAt,
            occurredAt: "2026-07-06T12:10:00.000Z",
            createdAt: "2026-07-06T12:05:00.000Z",
            updatedAt: "2026-07-06T12:10:00.000Z",
            clientSecret: "pi_1_secret",
        });
        expect(harness.rest.stripeRequests).toEqual([
            {
                method: "GET",
                pathname: "/v2/core/accounts/acct_seller_example_com",
                searchParams: [
                    ["include[0]", "configuration.recipient"],
                    ["include[1]", "defaults"],
                    ["include[2]", "identity"],
                    ["include[3]", "requirements"],
                ],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "GET",
                pathname: "/v1/balance_settings",
                searchParams: [],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "POST",
                pathname: "/v1/payment_intents",
                searchParams: [],
                idempotencyKey: `payment:1:${financialTermsHash}`,
                stripeAccount: null,
            },
        ]);

        harness.rest.clearStripeRequests();
        const listedResponse = await sourceRequestWithRole(harness, "admin-1", "admin", "listProviderPayments", {
            q: "provider-boundary",
            limit: "20",
        });
        expect(listedResponse.status).toBe(200);
        const listedBody = await jsonBody(listedResponse);
        expect(listedBody).toEqual({
            payments: [
                {
                    paymentId: 1,
                    providerPaymentId: 1,
                    clientReferenceId: "provider-boundary-order",
                    financialTermsHash,
                    financialRevision: 1,
                    buyerUserId: "user-123",
                    sellerUserId: "seller-1",
                    stripePaymentIntentId: "pi_1",
                    stripeChargeId: null,
                    providerEventId: null,
                    transferGroup,
                    currency: "eur",
                    amountTotal: 1200,
                    sellerTransferAmount: 1080,
                    platformRetainedAmount: 120,
                    refundedAmount: 0,
                    transferredAmount: 0,
                    reversedAmount: 0,
                    stripeChargeBalanceTransactionId: null,
                    actualStripeChargeFeeAmount: 0,
                    actualStripeRefundFeeAmount: 0,
                    actualStripeProcessingFeeAmount: 0,
                    actualStripeChargeNetAmount: null,
                    actualStripeFeeCurrency: null,
                    actualStripeChargeFeeDetails: [],
                    actualPlatformMarginAfterStripeAmount: 120,
                    paymentStatus: "created",
                    settlementStatus: "held",
                    disputeStatus: "none",
                    manualReviewReason: null,
                    description: null,
                    paidAt: null,
                    cancelledAt: null,
                    lastProviderSyncAt: created.lastProviderSyncAt,
                    occurredAt: "2026-07-06T12:10:00.000Z",
                    createdAt: "2026-07-06T12:05:00.000Z",
                    updatedAt: "2026-07-06T12:10:00.000Z",
                },
            ],
            total: 1,
        });
        expect(harness.rest.stripeRequests).toEqual([]);

        harness.rest.setPaymentIntentSucceeded("pi_1");
        const adminHeaders = {
            authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
            "x-cms-user-id": "admin-1",
            "x-cms-user-role": "admin",
        };
        const detailResponse = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/payments/payment?paymentId=1`, {
                headers: adminHeaders,
            }),
        );
        expect(detailResponse.status).toBe(200);
        const detailBody = await jsonBody(detailResponse);
        expect(detailBody.paidAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(detailBody.lastProviderSyncAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(detailBody).toEqual({
            paymentId: 1,
            providerPaymentId: 1,
            clientReferenceId: "provider-boundary-order",
            financialTermsHash,
            financialRevision: 1,
            dualApprovalThresholdAmount: 1000,
            buyerUserId: "user-123",
            sellerUserId: "seller-1",
            stripePaymentIntentId: "pi_1",
            stripeChargeId: "ch_1",
            stripeChargeBalanceTransactionId: "txn_charge_1",
            providerEventId: null,
            transferGroup,
            currency: "eur",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            platformRetainedAmount: 120,
            refundedAmount: 0,
            transferredAmount: 0,
            reversedAmount: 0,
            actualStripeChargeFeeAmount: 65,
            actualStripeRefundFeeAmount: 0,
            actualStripeProcessingFeeAmount: 65,
            actualStripeChargeNetAmount: 1135,
            actualStripeFeeCurrency: "eur",
            actualStripeChargeFeeDetails: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
            actualPlatformMarginAfterStripeAmount: 55,
            paymentStatus: "succeeded",
            commercePaymentStatus: "succeeded",
            settlementStatus: "held",
            disputeStatus: "none",
            reconciliationPending: false,
            manualReviewReason: null,
            description: null,
            paidAt: detailBody.paidAt,
            cancelledAt: null,
            lastProviderSyncAt: detailBody.lastProviderSyncAt,
            occurredAt: "2026-07-06T12:10:00.000Z",
            createdAt: "2026-07-06T12:05:00.000Z",
            updatedAt: "2026-07-06T12:10:00.000Z",
        });
        expect(harness.rest.stripeRequests).toEqual([
            {
                method: "GET",
                pathname: "/v1/payment_intents/pi_1",
                searchParams: [["expand[]", "latest_charge.balance_transaction"]],
                idempotencyKey: null,
                stripeAccount: null,
            },
        ]);

        harness.rest.clearStripeRequests();
        const missingResponse = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/payments/payment?paymentId=999`, {
                headers: adminHeaders,
            }),
        );
        expect(missingResponse.status).toBe(404);
        expect(await jsonBody(missingResponse)).toEqual({ error: "payment not found" });
        expect(harness.rest.stripeRequests).toEqual([]);
    });

    test("returns the authenticated seller wallet directly from Stripe", async () => {
        const harness = await createHarness();

        const emptyWallet = await okJson(await sourceRequest(harness, "getConnectWallet"));
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                    country: "FR",
                },
                { userId: "seller-1" },
            ),
        );
        const wallet = await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectWallet"));

        expect(emptyWallet).toMatchObject({ connected: false, balances: [] });
        expect(wallet).toMatchObject({
            connected: true,
            stripeAccountId: "acct_seller_example_com",
            livemode: false,
            balances: [
                {
                    currency: "eur",
                    available: 4500,
                    pending: 1800,
                    total: 6300,
                    instantAvailable: 1000,
                    reserved: 200,
                },
                {
                    currency: "usd",
                    available: 0,
                    pending: 125,
                    total: 125,
                    instantAvailable: 0,
                    reserved: 0,
                },
            ],
        });
        expect(wallet.refreshedAt).toBeString();
    });

    registerSellerPayoutSourceScenarios(createHarness);

    test("rejects a manual platform schedule even when the liability minimum is retained", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const command = {
            platformPayoutControlChangeId: "platform-risk-policy-1",
            minimumBalanceEur: 5000,
            liabilityRevision: 1,
            debitNegativeBalances: true,
            reason: "Protected C2C platform reserve",
        };
        await okJson(await sourceJson(harness, "configurePlatformPayoutControls", command));
        harness.rest.setPlatformPayoutInterval("manual");
        const blocked = await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "unsafe-platform-payout-order",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        });
        expect(blocked.status).toBe(503);

        const configured = await okJson(await sourceJson(harness, "configurePlatformPayoutControls", command));
        expect(configured).toMatchObject({
            platformPayoutControlChangeId: "platform-risk-policy-1",
            payoutControl: { interval: "daily", minimumBalanceByCurrency: { eur: 5000 } },
        });
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "protected-platform-payout-order",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        expect(created.paymentStatus).toBe("created");
    });

    test("accepts Stripe omitting the platform zero payout minimum", async () => {
        const harness = await createHarness();

        const configured = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-zero-minimum-canonicalized-by-stripe",
                minimumBalanceEur: 0,
                liabilityRevision: 1,
                debitNegativeBalances: false,
            }),
        );

        expect(configured).toMatchObject({
            appliedMinimumBalanceEur: 0,
            payoutControl: {
                interval: "daily",
                minimumBalanceByCurrency: {},
                debitNegativeBalances: false,
            },
        });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                operation_type: "payout_schedule_update",
                status: "succeeded",
            }),
        );
    });

    test("keeps the higher platform reserve when payout protection commands race", async () => {
        const harness = await createHarness();
        const pause = harness.rest.pauseNextPlatformBalanceSettingsUpdate();
        const lowerUpdate = sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-race-lower",
            minimumBalanceEur: 100,
            liabilityRevision: 1,
            debitNegativeBalances: true,
        });

        await pause.entered;
        const higherUpdate = await sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-race-higher",
            minimumBalanceEur: 200,
            liabilityRevision: 2,
            debitNegativeBalances: true,
        });
        pause.resume();
        const completed = await okJson(await lowerUpdate);

        expect(higherUpdate.status).toBe(409);
        expect(completed).toMatchObject({
            liabilityRevision: 2,
            payoutControl: { interval: "daily", minimumBalanceByCurrency: { eur: 200 } },
        });
        expect(harness.rest.balanceSettingsUpdateCount).toBe(2);
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 2,
            required_minimum_amount: 200,
            provider_minimum_amount: 200,
            claim_owner: null,
        });
    });

    test("recovers a lost platform payout protection response without lowering the reserve", async () => {
        const harness = await createHarness();
        const command = {
            platformPayoutControlChangeId: "platform-lost-response",
            minimumBalanceEur: 350,
            liabilityRevision: 1,
            debitNegativeBalances: true,
        };
        harness.rest.loseNextPlatformPayoutProtectionResponse();

        const ambiguous = await sourceJson(harness, "configurePlatformPayoutControls", command);
        const recovered = await okJson(await sourceJson(harness, "configurePlatformPayoutControls", command));

        expect(ambiguous.status).toBe(502);
        expect(recovered).toMatchObject({
            payoutControl: { interval: "daily", minimumBalanceByCurrency: { eur: 350 } },
        });
        expect(harness.rest.balanceSettingsUpdateCount).toBe(1);
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            required_minimum_amount: 350,
            provider_minimum_amount: 350,
            last_error: null,
        });
    });

    test("retains an overcovered platform reserve until Finance authorizes the exact decrease", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-increase-r1",
                minimumBalanceEur: 35476,
                liabilityRevision: 1,
                debitNegativeBalances: false,
            }),
        );

        const retained = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-decrease-r2-retained",
                minimumBalanceEur: 34496,
                liabilityRevision: 2,
                debitNegativeBalances: false,
            }),
        );
        expect(retained).toMatchObject({
            liabilityRevision: 2,
            appliedMinimumBalanceEur: 35476,
            decreaseAuthorizationId: null,
            payoutControl: { minimumBalanceByCurrency: { eur: 35476 } },
        });
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 2,
            required_minimum_amount: 34496,
            provider_minimum_amount: 35476,
            decrease_authorization_id: null,
            claim_owner: null,
        });
        const retainedReplay = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-decrease-r2-retained",
                minimumBalanceEur: 34496,
                liabilityRevision: 2,
                debitNegativeBalances: false,
            }),
        );
        expect(retainedReplay).toMatchObject({
            liabilityRevision: 2,
            appliedMinimumBalanceEur: 35476,
        });
        expect(harness.rest.balanceSettingsUpdateCount).toBe(1);

        const authorizationId = "11111111-1111-4111-8111-111111111111";
        const decreased = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-decrease-r2",
                minimumBalanceEur: 34496,
                liabilityRevision: 2,
                decreaseAuthorizationId: authorizationId,
                debitNegativeBalances: false,
            }),
        );
        expect(decreased).toMatchObject({
            liabilityRevision: 2,
            appliedMinimumBalanceEur: 34496,
            decreaseAuthorizationId: authorizationId,
            payoutControl: { minimumBalanceByCurrency: { eur: 34496 } },
        });

        const stale = await sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-stale-r1",
            minimumBalanceEur: 35476,
            liabilityRevision: 1,
            debitNegativeBalances: false,
        });
        expect(stale.status).toBe(409);
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 2,
            required_minimum_amount: 34496,
            provider_minimum_amount: 34496,
            decrease_authorization_id: null,
        });
    });

    test("never lowers a higher provider-side platform reserve drift without Finance authority", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-provider-drift-r1",
                minimumBalanceEur: 100,
                liabilityRevision: 1,
                debitNegativeBalances: false,
            }),
        );
        harness.rest.setPlatformPayoutMinimum(450);

        const retained = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-provider-drift-r2",
                minimumBalanceEur: 200,
                liabilityRevision: 2,
                debitNegativeBalances: false,
            }),
        );

        expect(retained).toMatchObject({
            liabilityRevision: 2,
            appliedMinimumBalanceEur: 450,
            decreaseAuthorizationId: null,
            payoutControl: { minimumBalanceByCurrency: { eur: 450 } },
        });
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 2,
            required_minimum_amount: 200,
            provider_minimum_amount: 450,
            claim_owner: null,
        });
    });

    test("reports the final consumed authority when a higher revision wins during a decrease", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-authority-race-r1",
                minimumBalanceEur: 500,
                liabilityRevision: 1,
                debitNegativeBalances: false,
            }),
        );
        const authorizationId = "22222222-2222-4222-8222-222222222222";
        const pause = harness.rest.pauseNextPlatformBalanceSettingsUpdate();
        const decreasing = sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-authority-race-r2",
            minimumBalanceEur: 200,
            liabilityRevision: 2,
            decreaseAuthorizationId: authorizationId,
            debitNegativeBalances: false,
        });
        await pause.entered;
        const higher = await sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-authority-race-r3",
            minimumBalanceEur: 700,
            liabilityRevision: 3,
            debitNegativeBalances: false,
        });
        pause.resume();
        const completed = await okJson(await decreasing);

        expect(higher.status).toBe(409);
        expect(completed).toMatchObject({
            liabilityRevision: 3,
            appliedMinimumBalanceEur: 700,
            decreaseAuthorizationId: null,
            payoutControl: { minimumBalanceByCurrency: { eur: 700 } },
        });
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 3,
            required_minimum_amount: 700,
            provider_minimum_amount: 700,
            decrease_authorization_id: null,
        });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                request: expect.objectContaining({
                    commerceRequestedDecreaseAuthorizationId: authorizationId,
                    commerceLiabilityRevision: 3,
                }),
            }),
        );
    });

    test("rejects ineligible sellers and hidden payments", async () => {
        const harness = await createHarness();

        const ineligible = await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "missing-seller",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "missing-order",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        });
        const sellerSession = await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const payment = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "private-order",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const hidden = await sourceRequestWithUser(harness, "stranger", "getProtectedPayment", {
            paymentId: String(payment.paymentId),
        });

        expect(sellerSession.connected).toBe(true);
        expect(ineligible.status).toBe(409);
        expect(await jsonBody(ineligible)).toEqual({
            error: "seller enrollment does not allow a held platform payment",
        });
        expect(hidden.status).toBe(403);
        expect(await jsonBody(hidden)).toEqual({ error: "payment is not visible to this user" });
    });

    test("preflights the exact current seller terms without creating a payment", async () => {
        const harness = await createHarness();
        const version = "courtside-seller-2026-07";
        const requestEligibility = async (
            sellerUserId: string,
            buyerUserId = "buyer-1",
            termsVersion = version,
            termsHash = marketplaceTermsHash,
        ) =>
            harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/payments/seller-eligibility`, {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
                        "x-user-id": buyerUserId,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        sellerUserId,
                        marketplaceTermsVersion: termsVersion,
                        marketplaceTermsHash: termsHash,
                    }),
                }),
            );

        const missing = await requestEligibility("missing-seller");
        expect(missing.status).toBe(200);
        expect(await jsonBody(missing)).toEqual({ eligible: false, reasonCode: "seller_account_missing" });

        await okJson(
            await sourceJsonWithUser(harness, "seller-1", "enrollConnectSeller", {
                accountToken: "accttok_test_identity_123",
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: version,
                marketplaceTermsHash,
            }),
        );

        const eligible = await requestEligibility("seller-1");
        const staleTerms = await requestEligibility("seller-1", "buyer-1", "courtside-seller-2026-08", "d".repeat(64));
        const selfPurchase = await requestEligibility("seller-1", "seller-1");

        expect(await jsonBody(eligible)).toEqual({ eligible: true, reasonCode: "eligible" });
        expect(await jsonBody(staleTerms)).toEqual({ eligible: false, reasonCode: "seller_terms_not_current" });
        expect(await jsonBody(selfPurchase)).toEqual({ eligible: false, reasonCode: "buyer_is_seller" });
        expect(harness.rest.rows("payments")).toHaveLength(0);
        expect(JSON.stringify(await jsonBody(await requestEligibility("seller-1")))).not.toContain("acct_");
    });

    test("derives protected-payment eligibility from the exact application-controlled account state", async () => {
        const safe = await createHarness();
        await okJson(
            await sourceJson(
                safe,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const safeStatus = await okJson(await sourceRequestWithUser(safe, "seller-1", "getConnectStatus"));
        expect(safeStatus).toMatchObject({
            stripeAccountApiVersion: "v2",
            applicationControlledRecipient: true,
            canReceiveProtectedPayments: true,
        });

        safe.rest.exposeSellerFinancialRisk("seller-1", 100);
        const riskyStatus = await okJson(await sourceRequestWithUser(safe, "seller-1", "getConnectStatus"));
        expect(riskyStatus).toMatchObject({
            applicationControlledRecipient: true,
            canReceiveProtectedPayments: false,
            riskStatus: "restricted",
        });

        const legacy = await createHarness();
        legacy.rest.seedActiveLegacyAccount("user-123");
        const legacyStatus = await okJson(await sourceRequest(legacy, "getConnectStatus"));
        expect(legacyStatus).toMatchObject({
            stripeAccountApiVersion: "v1",
            applicationControlledRecipient: false,
            payoutsEnabled: true,
            canReceiveProtectedPayments: false,
        });
    });

    test("releases with source_transaction and reverses before a protected refund", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "order-release-1",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        const paid = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );
        expect(paid).toMatchObject({
            paymentStatus: "succeeded",
            stripeChargeId: "ch_1",
            stripeChargeBalanceTransactionId: "txn_charge_1",
            actualStripeChargeFeeAmount: 65,
            actualStripeRefundFeeAmount: 0,
            actualStripeProcessingFeeAmount: 65,
            actualStripeChargeNetAmount: 1135,
            actualStripeFeeCurrency: "eur",
            actualPlatformMarginAfterStripeAmount: 55,
        });

        const transfer = await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-order-1",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        expect(transfer).toMatchObject({
            stripeTransferId: "tr_1",
            sourceChargeId: "ch_1",
            destinationAccountId: "acct_seller_example_com",
            status: "succeeded",
        });
        expect(harness.rest.lastTransferParameters).toMatchObject({
            source_transaction: "ch_1",
            destination: "acct_seller_example_com",
            amount: "1080",
        });

        const protectedRefund = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-order-1",
                commerceRefundRequestId: 77,
                amount: 1200,
                authorizedSellerAmount: 0,
                sellerEntitlementReductionAmount: 1080,
                reason: "resolved buyer claim",
            }),
        );
        expect(protectedRefund.reversal).toMatchObject({
            status: "succeeded",
            confirmedAmount: 1080,
            reversals: [{ status: "succeeded", stripeTransferReversalId: "trr_1", amount: 1080 }],
        });
        expect(protectedRefund.refund).toMatchObject({
            status: "succeeded",
            stripeRefundId: "re_1",
            stripeBalanceTransactionId: "txn_refund_1",
            actualStripeFeeAmount: 0,
            actualStripeNetAmount: -1200,
            actualStripeFeeCurrency: "eur",
        });
        expect(protectedRefund.operations).toMatchObject([
            { operationType: "reversal", status: "succeeded", amount: 1080 },
            { operationType: "refund", status: "succeeded", amount: 1200, commerceRefundRequestId: 77 },
        ]);
        const riskAfterRecovery = await okJson(
            await sourceRequest(harness, "getSellerProviderRisk", {
                userId: "seller-1",
            }),
        );
        expect(riskAfterRecovery).toMatchObject({
            account: { payoutSchedule: "manual", outstandingDebtAmount: 0, financialExposureAmount: 0 },
            payoutControl: { interval: "manual", minimumBalanceByCurrency: { eur: 1080 } },
        });
        const operations = await okJson(await sourceRequest(harness, "listFinancialOperations"));
        expect(operations.operations).toContainEqual(
            expect.objectContaining({
                operationType: "refund_create",
                amount: 1200,
                currency: "eur",
                refundRequestId: "refund-order-1",
                commerceRefundRequestId: 77,
            }),
        );
        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "financial-operation-projection",
            }),
        );
        expect(reconciliation.commerceOperations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ operationType: "transfer", orderPublicId: "order-release-1", amount: 1080 }),
                expect.objectContaining({ operationType: "reversal", orderPublicId: "order-release-1", amount: 1080 }),
            ]),
        );
        expect(reconciliation.commerceOperations).not.toContainEqual(
            expect.objectContaining({ operationType: "refund" }),
        );
        const transferProjection = (reconciliation.commerceOperations as JsonRecord[]).find(
            (operation) => operation.operationType === "transfer",
        )!;
        expect(Object.hasOwn(transferProjection, "commerceRefundRequestId")).toBe(false);
        expect(Object.hasOwn(transferProjection, "refundRequestId")).toBe(false);
        for (const projection of reconciliation.commerceOperations as JsonRecord[]) {
            const outbox = harness.rest
                .rows("commerce_projection_outbox")
                .find((row) => same(row.id, projection.projectionId));
            expect(projection.providerEventId).toBe(outbox?.projection_key);
            await okJson(
                await sourceJson(harness, "acknowledgeCommerceProjection", {
                    projectionId: projection.projectionId,
                    claimToken: projection.projectionClaimToken,
                }),
            );
        }
        const afterReversals = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "financial-operation-projection-after-reversals",
            }),
        );
        expect(afterReversals.commerceOperations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    operationType: "refund",
                    orderPublicId: "order-release-1",
                    refundRequestId: "refund-order-1",
                    commerceRefundRequestId: 77,
                    amount: 1200,
                }),
            ]),
        );
        const refundProjection = (afterReversals.commerceOperations as JsonRecord[]).find(
            (operation) => operation.operationType === "refund",
        )!;
        const refundOutbox = harness.rest
            .rows("commerce_projection_outbox")
            .find((row) => same(row.id, refundProjection.projectionId));
        expect(refundProjection.providerEventId).toBe(refundOutbox?.projection_key);
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal", "refund"]);
    });

    test("accounts for signed Stripe refund fee credits exactly once", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "refund-fee-credit",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.setNextRefundFee(-20);

        const first = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-fee-credit-1",
                commerceRefundRequestId: 701,
                amount: 100,
                authorizedSellerAmount: 980,
                sellerEntitlementReductionAmount: 100,
                reason: "partial buyer remedy",
            }),
        );
        const replay = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-fee-credit-1",
                commerceRefundRequestId: 701,
                amount: 100,
                authorizedSellerAmount: 980,
                sellerEntitlementReductionAmount: 100,
                reason: "partial buyer remedy",
            }),
        );
        const payment = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(harness.rest.rows("refunds")[0]).toMatchObject({
            stripe_balance_transaction_id: "txn_refund_1",
            actual_stripe_fee_amount: -20,
            actual_stripe_net_amount: -80,
        });
        expect(first.refund).toMatchObject({
            stripeBalanceTransactionId: "txn_refund_1",
            actualStripeFeeAmount: -20,
            actualStripeNetAmount: -80,
        });
        expect(replay.refund).toMatchObject({
            refundId: first.refund.refundId,
            actualStripeFeeAmount: -20,
        });
        expect(payment).toMatchObject({
            actualStripeChargeFeeAmount: 65,
            actualStripeRefundFeeAmount: -20,
            actualStripeProcessingFeeAmount: 45,
            actualPlatformMarginAfterStripeAmount: 75,
        });
        expect(harness.rest.rows("refunds")).toHaveLength(1);
    });

    test("blocks the seller and enforces a provider payout hold when recovery is impossible", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "order-debt-1",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-debt-1",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.rejectTransferReversals();

        const failed = await sourceJson(harness, "requestProtectedRefund", {
            paymentId: created.paymentId,
            refundRequestId: "refund-debt-1",
            commerceRefundRequestId: 78,
            amount: 1200,
            authorizedSellerAmount: 0,
            sellerEntitlementReductionAmount: 1080,
            reason: "late buyer remedy",
        });
        expect(failed.status).toBe(409);
        expect(await jsonBody(failed)).toEqual({ error: "seller recovery failed; refund requires finance review" });
        const account = harness.rest.rows("accounts")[0];
        expect(account).toMatchObject({
            risk_status: "blocked",
            payout_schedule: "manual",
            outstanding_debt_amount: 1080,
            financial_exposure_amount: 0,
        });
        expect(
            Date.parse(String(account.manual_payout_hold_alert_at)) -
                Date.parse(String(account.manual_payout_hold_started_at)),
        ).toBe(75 * 24 * 60 * 60 * 1000);
        expect(
            Date.parse(String(account.manual_payout_hold_deadline_at)) -
                Date.parse(String(account.manual_payout_hold_started_at)),
        ).toBe(90 * 24 * 60 * 60 * 1000);
        expect(harness.rest.rows("seller_recovery_exposures")).toContainEqual(
            expect.objectContaining({
                recovery_key: "refund-debt-1:seller-recovery",
                status: "debt",
                amount: 1080,
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "seller_recovery_debt",
                severity: "critical",
            }),
        );

        const unsafePayout = await sourceJson(harness, "configureSellerPayoutSchedule", {
            userId: "seller-1",
            payoutScheduleChangeId: "unsafe-after-debt",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            minimumBalanceEur: 1080,
        });
        expect(unsafePayout.status).toBe(409);

        harness.rest.setManualPayoutHoldWindow(
            "seller-1",
            "2026-01-01T00:00:00.000Z",
            "2026-01-02T00:00:00.000Z",
            "2099-01-01T00:00:00.000Z",
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-manual-hold-alert",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "seller_manual_payout_hold_deadline_approaching",
                severity: "high",
            }),
        );

        harness.rest.setManualPayoutHoldWindow(
            "seller-1",
            "2025-01-01T00:00:00.000Z",
            "2025-03-17T00:00:00.000Z",
            "2025-04-01T00:00:00.000Z",
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-manual-hold-deadline",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "manual_review",
            financial_hold_reason: "Emergency seller payout hold exceeded the French 90-day deadline",
        });
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "seller_manual_payout_hold_deadline_exceeded",
                severity: "critical",
            }),
        );
    });

    test("leases every provider projection durably without starvation or poison blocking", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "order-projection-outbox",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));

        const firstRun = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "projection-lost-ack-1",
                limit: 1,
            }),
        );
        const firstLease = (firstRun.payments as JsonRecord[])[0]!;
        expect(firstLease.occurredAt).toBe(firstLease.updatedAt);
        harness.rest.expireProjectionLease(Number(firstLease.projectionId));
        const reclaimedRun = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "projection-lost-ack-2",
                limit: 1,
            }),
        );
        const reclaimed = (reclaimedRun.payments as JsonRecord[])[0]!;
        expect(reclaimed).toMatchObject({
            projectionId: firstLease.projectionId,
            projectionAttemptCount: 2,
        });
        expect(reclaimed.projectionClaimToken).not.toBe(firstLease.projectionClaimToken);
        await okJson(
            await sourceJson(harness, "acknowledgeCommerceProjection", {
                projectionId: reclaimed.projectionId,
                claimToken: reclaimed.projectionClaimToken,
            }),
        );
        const remainingInitial = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "projection-lost-ack-drain",
                limit: 5,
            }),
        );
        for (const projection of remainingInitial.payments as JsonRecord[]) {
            await okJson(
                await sourceJson(harness, "acknowledgeCommerceProjection", {
                    projectionId: projection.projectionId,
                    claimToken: projection.projectionClaimToken,
                }),
            );
        }

        for (let index = 0; index < 7; index++) {
            harness.rest.seedPaymentProjection(Number(created.paymentId), `test:payment:backlog:${index}`);
        }
        const backlogOne = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "projection-backlog-1",
                limit: 5,
            }),
        );
        expect(backlogOne.payments).toHaveLength(5);
        for (const projection of backlogOne.payments as JsonRecord[]) {
            await okJson(
                await sourceJson(harness, "acknowledgeCommerceProjection", {
                    projectionId: projection.projectionId,
                    claimToken: projection.projectionClaimToken,
                }),
            );
        }
        const backlogTwo = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "projection-backlog-2",
                limit: 5,
            }),
        );
        expect(backlogTwo.payments).toHaveLength(2);
        for (const projection of backlogTwo.payments as JsonRecord[]) {
            await okJson(
                await sourceJson(harness, "acknowledgeCommerceProjection", {
                    projectionId: projection.projectionId,
                    claimToken: projection.projectionClaimToken,
                }),
            );
        }

        harness.rest.seedPaymentProjection(Number(created.paymentId), "test:payment:poison");
        harness.rest.seedPaymentProjection(Number(created.paymentId), "test:payment:healthy");
        const poisonBatch = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "projection-poison-1",
                limit: 2,
            }),
        );
        const [poison, healthy] = poisonBatch.payments as JsonRecord[];
        await okJson(
            await sourceJson(harness, "failCommerceProjection", {
                projectionId: poison!.projectionId,
                claimToken: poison!.projectionClaimToken,
                error: "synthetic Commerce poison projection",
            }),
        );
        await okJson(
            await sourceJson(harness, "acknowledgeCommerceProjection", {
                projectionId: healthy!.projectionId,
                claimToken: healthy!.projectionClaimToken,
            }),
        );
        harness.rest.seedPaymentProjection(Number(created.paymentId), "test:payment:after-poison");
        const afterPoison = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "projection-poison-2",
                limit: 1,
            }),
        );
        expect(afterPoison.payments).toHaveLength(1);
        expect((afterPoison.payments as JsonRecord[])[0]?.providerEventId).toBe("test:payment:after-poison");
        const afterPoisonLease = (afterPoison.payments as JsonRecord[])[0]!;
        await okJson(
            await sourceJson(harness, "acknowledgeCommerceProjection", {
                projectionId: afterPoisonLease.projectionId,
                claimToken: afterPoisonLease.projectionClaimToken,
            }),
        );

        for (let attempt = 2; attempt <= 5; attempt++) {
            harness.rest.makeProjectionRetryDue(Number(poison!.projectionId));
            const retry = await okJson(
                await sourceJson(harness, "runProviderReconciliation", {
                    runKey: `projection-poison-retry-${attempt}`,
                    limit: 1,
                }),
            );
            const retryLease = (retry.payments as JsonRecord[])[0]!;
            expect(retryLease.projectionId).toBe(poison!.projectionId);
            await okJson(
                await sourceJson(harness, "failCommerceProjection", {
                    projectionId: retryLease.projectionId,
                    claimToken: retryLease.projectionClaimToken,
                    error: "synthetic Commerce poison projection",
                }),
            );
        }
        expect(harness.rest.rows("commerce_projection_outbox")).toContainEqual(
            expect.objectContaining({
                id: poison!.projectionId,
                projection_status: "manual_review",
                attempt_count: 5,
                intervention_revision: 0,
                last_error: "synthetic Commerce poison projection",
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                deduplication_key: `commerce-projection:${poison!.projectionId}`,
                exception_type: "commerce_projection_delivery_failed",
                severity: "critical",
                status: "open",
            }),
        );

        const forbidden = await sourceJsonWithRole(harness, "support-1", "support", "requeueCommerceProjection", {
            projectionId: poison!.projectionId,
            expectedInterventionRevision: 0,
            reason: "Commerce consumer was repaired",
        });
        expect(forbidden.status).toBe(403);
        const requeued = await okJson(
            await sourceJson(harness, "requeueCommerceProjection", {
                projectionId: poison!.projectionId,
                expectedInterventionRevision: 0,
                reason: "Commerce consumer was repaired",
            }),
        );
        expect(requeued).toMatchObject({
            projectionId: poison!.projectionId,
            projectionStatus: "retry",
            interventionRevision: 1,
        });
        const staleReplay = await sourceJson(harness, "requeueCommerceProjection", {
            projectionId: poison!.projectionId,
            expectedInterventionRevision: 0,
            reason: "stale duplicate intervention",
        });
        expect(staleReplay.status).toBe(409);
        expect(harness.rest.rows("commerce_projection_interventions")).toContainEqual(
            expect.objectContaining({
                projection_id: poison!.projectionId,
                intervention_revision: 1,
                actor_id: "user-123",
                reason: "Commerce consumer was repaired",
            }),
        );

        const interventionRun = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "projection-poison-finance-requeue",
                limit: 1,
            }),
        );
        const interventionLease = (interventionRun.payments as JsonRecord[])[0]!;
        expect(interventionLease.projectionId).toBe(poison!.projectionId);
        await okJson(
            await sourceJson(harness, "acknowledgeCommerceProjection", {
                projectionId: interventionLease.projectionId,
                claimToken: interventionLease.projectionClaimToken,
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                deduplication_key: `commerce-projection:${poison!.projectionId}`,
                status: "resolved",
                resolved_by: "commerce-projection-ack",
            }),
        );
        expect(
            harness.rest
                .rows("commerce_projection_outbox")
                .filter((row) => row.projection_key === "test:payment:poison"),
        ).toHaveLength(1);
    });

    test("reverses initial and reserve Transfers before one full protected refund", async () => {
        const { harness, created } = await createPaidPaymentWithReleases("order-two-transfer-refund", [
            { id: "release-initial-split", kind: "initial", amount: 900 },
            { id: "release-reserve-split", kind: "reserve", amount: 180 },
        ]);

        const result = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-two-transfer-full",
                commerceRefundRequestId: 801,
                amount: 1200,
                authorizedSellerAmount: 0,
                sellerEntitlementReductionAmount: 1080,
                reason: "full buyer remedy",
            }),
        );

        expect(result.reversal).toMatchObject({
            status: "succeeded",
            requestedAmount: 1080,
            confirmedAmount: 1080,
            allocationShortfallAmount: 0,
            reversals: [
                { amount: 180, stripeTransferReversalId: "trr_1", status: "succeeded" },
                { amount: 900, stripeTransferReversalId: "trr_2", status: "succeeded" },
            ],
        });
        expect(result.operations).toMatchObject([
            { operationType: "reversal", amount: 180, status: "succeeded" },
            { operationType: "reversal", amount: 900, status: "succeeded" },
            { operationType: "refund", amount: 1200, status: "succeeded" },
        ]);
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "transfer", "reversal", "reversal", "refund"]);
    });

    test("allocates a partial seller recovery deterministically across two Transfers", async () => {
        const { harness, created } = await createPaidPaymentWithReleases("order-two-transfer-partial", [
            { id: "release-initial-partial", kind: "initial", amount: 900 },
            { id: "release-reserve-partial", kind: "reserve", amount: 180 },
        ]);

        const result = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-two-transfer-partial",
                commerceRefundRequestId: 802,
                amount: 250,
                authorizedSellerAmount: 830,
                sellerEntitlementReductionAmount: 250,
                reason: "partial buyer remedy",
            }),
        );

        expect(result.reversal).toMatchObject({
            requestedAmount: 250,
            confirmedAmount: 250,
            reversals: [
                { amount: 180, status: "succeeded" },
                { amount: 70, status: "succeeded" },
            ],
        });
        expect(result.operations).toHaveLength(3);
        expect(harness.rest.rows("refunds")[0]).toMatchObject({
            amount: 250,
            required_reversal_amount: 250,
            status: "succeeded",
        });
    });

    test("reconciles a lost second reversal response without duplicating any money movement", async () => {
        const { harness, created } = await createPaidPaymentWithReleases("order-two-transfer-lost-response", [
            { id: "release-initial-lost", kind: "initial", amount: 900 },
            { id: "release-reserve-lost", kind: "reserve", amount: 180 },
        ]);
        harness.rest.loseTransferReversalResponseAfter(1);
        const body = {
            paymentId: created.paymentId,
            refundRequestId: "refund-two-transfer-lost",
            commerceRefundRequestId: 803,
            amount: 1200,
            authorizedSellerAmount: 0,
            sellerEntitlementReductionAmount: 1080,
            reason: "buyer remedy with lost provider response",
        };

        const first = await sourceJson(harness, "requestProtectedRefund", body);
        expect(first.status).toBe(409);
        expect(harness.rest.rows("refunds")).toHaveLength(0);
        expect(harness.rest.rows("transfer_recovery_requests")[0]).toMatchObject({
            status: "manual_review",
            confirmed_amount: 180,
        });

        const retried = await okJson(await sourceJson(harness, "requestProtectedRefund", body));
        expect(retried.reversal).toMatchObject({ status: "succeeded", confirmedAmount: 1080 });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "transfer", "reversal", "reversal", "refund"]);
        expect(harness.rest.rows("transfer_reversals")).toHaveLength(2);
        expect(
            harness.rest
                .rows("financial_operations")
                .filter((row) => row.operation_type === "transfer_reversal_create"),
        ).toEqual([
            expect.objectContaining({ status: "succeeded", stripe_object_id: "trr_1" }),
            expect.objectContaining({ status: "succeeded", stripe_object_id: "trr_2" }),
        ]);
    });

    test("records debt and never refunds when confirmed Transfers cannot cover recovery", async () => {
        const { harness, created } = await createPaidPaymentWithReleases("order-recovery-shortfall", [
            { id: "release-shortfall", kind: "initial", amount: 900 },
        ]);
        harness.rest.patchPaymentLedger(Number(created.paymentId), { transferred_amount: 1080 });

        const failed = await sourceJson(harness, "requestTransferReversal", {
            paymentId: created.paymentId,
            reversalRequestId: "manual-recovery-shortfall",
            amount: 1080,
            reason: "shortfall must fail closed",
        });

        expect(failed.status).toBe(409);
        expect(harness.rest.rows("transfer_recovery_requests")[0]).toMatchObject({
            requested_amount: 1080,
            allocated_amount: 900,
            confirmed_amount: 900,
            allocation_shortfall_amount: 180,
            status: "manual_review",
        });
        expect(harness.rest.rows("refunds")).toHaveLength(0);
        expect(harness.rest.rows("seller_recovery_exposures")[0]).toMatchObject({
            status: "debt",
            amount: 1080,
            recovered_amount: 900,
        });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({ outstanding_debt_amount: 180 });
        expect(harness.rest.rows("payments")[0]).toMatchObject({ settlement_status: "manual_review" });
    });

    test("reverses both initial and reserve Transfers for one chargeback", async () => {
        const { harness } = await createPaidPaymentWithReleases("order-two-transfer-chargeback", [
            { id: "release-initial-chargeback", kind: "initial", amount: 900 },
            { id: "release-reserve-chargeback", kind: "reserve", amount: 180 },
        ]);
        harness.rest.addProviderDispute("ch_1", {
            id: "dp_two_transfer_chargeback",
            amount: 1200,
            status: "needs_response",
        });

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "two-transfer-chargeback",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("transfer_recovery_requests")[0]).toMatchObject({
            exposure_type: "chargeback",
            requested_amount: 1080,
            confirmed_amount: 1080,
            status: "succeeded",
        });
        expect(harness.rest.rows("transfer_reversals").map((row) => row.amount)).toEqual([180, 900]);
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "transfer", "reversal", "reversal"]);
        expect(harness.rest.rows("refunds")).toHaveLength(0);
    });

    test("still attempts seller recovery when the provider payout hold is unavailable", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "order-hold-outage",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-hold-outage",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.rejectBalanceSettingsUpdates();

        const refunded = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-hold-outage",
                commerceRefundRequestId: 79,
                amount: 1200,
                authorizedSellerAmount: 0,
                sellerEntitlementReductionAmount: 1080,
                reason: "buyer remedy during provider payout outage",
            }),
        );

        expect(refunded.reversal).toMatchObject({
            status: "succeeded",
            confirmedAmount: 1080,
            reversals: [{ status: "succeeded", stripeTransferReversalId: "trr_1", amount: 1080 }],
        });
        expect(refunded.refund).toMatchObject({ status: "succeeded", stripeRefundId: "re_1" });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal", "refund"]);
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "seller_payout_hold_failed",
                severity: "critical",
            }),
        );
    });

    test("releases only the remaining authorized seller amount after a partial refund", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "order-partial-refund-before-release",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));

        const partialRefund = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-partial-before-release",
                commerceRefundRequestId: 79,
                amount: 400,
                authorizedSellerAmount: 780,
                sellerEntitlementReductionAmount: 300,
                reason: "partial buyer remedy",
            }),
        );
        const release = await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-after-partial-refund",
                releaseKind: "initial",
                amount: 780,
                currency: "eur",
            }),
        );
        const payment = harness.rest.rows("payments")[0];

        expect(partialRefund).toMatchObject({
            reversal: null,
            refund: {
                amount: 400,
                requiredReversalAmount: 0,
                sellerEntitlementReductionAmount: 300,
                authorizedSellerAmount: 780,
                status: "succeeded",
            },
        });
        expect(release).toMatchObject({ amount: 780, status: "succeeded" });
        expect(payment).toMatchObject({
            refunded_amount: 400,
            transferred_amount: 780,
            reversed_amount: 0,
            settlement_status: "released",
        });
        expect(harness.rest.lastTransferParameters).toMatchObject({ amount: "780" });
        expect(harness.rest.moneyCallOrder).toEqual(["refund", "transfer"]);

        const secondRefund = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-partial-after-release",
                commerceRefundRequestId: 80,
                amount: 200,
                authorizedSellerAmount: 580,
                sellerEntitlementReductionAmount: 200,
                reason: "second partial buyer remedy",
            }),
        );
        expect(secondRefund).toMatchObject({
            reversal: {
                requestedAmount: 200,
                confirmedAmount: 200,
                reversals: [{ amount: 200, status: "succeeded" }],
            },
            refund: {
                amount: 200,
                requiredReversalAmount: 200,
                sellerEntitlementReductionAmount: 200,
                authorizedSellerAmount: 580,
                status: "succeeded",
            },
        });
        expect(harness.rest.moneyCallOrder).toEqual(["refund", "transfer", "reversal", "refund"]);
    });

    test("projects a pending refund before its exact succeeded provider transition", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "order-pending-refund-success",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.setNextRefundStatus("pending");

        const requested = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-pending-success",
                commerceRefundRequestId: 901,
                amount: 300,
                authorizedSellerAmount: 780,
                sellerEntitlementReductionAmount: 300,
                reason: "pending provider refund",
            }),
        );
        expect(requested.refund).toMatchObject({ status: "pending", stripeRefundId: "re_1" });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                operation_type: "refund_create",
                status: "processing",
            }),
        );

        const pendingRun = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "pending-refund-projection",
                limit: 25,
            }),
        );
        const pendingProjection = (pendingRun.commerceOperations as JsonRecord[]).find(
            (operation) => operation.refundRequestId === "refund-pending-success",
        )!;
        expect(pendingProjection).toMatchObject({ operationType: "refund", status: "pending" });
        await okJson(
            await sourceJson(harness, "acknowledgeCommerceProjection", {
                projectionId: pendingProjection.projectionId,
                claimToken: pendingProjection.projectionClaimToken,
            }),
        );

        harness.rest.updateProviderRefund("re_1", { status: "succeeded" });
        const succeededRun = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "pending-refund-provider-reconciled",
                limit: 25,
            }),
        );
        const succeededProjection = (succeededRun.commerceOperations as JsonRecord[]).find(
            (operation) => operation.refundRequestId === "refund-pending-success",
        )!;
        expect(succeededProjection).toMatchObject({ operationType: "refund", status: "succeeded" });
        expect(harness.rest.rows("refunds")[0]).toMatchObject({ status: "succeeded" });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                operation_type: "refund_create",
                status: "succeeded",
            }),
        );

        harness.rest.updateProviderRefund("re_1", { status: "pending" });
        const stalePayload = JSON.stringify({
            id: "evt_stale_pending_refund_1",
            type: "refund.updated",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000) - 60,
            livemode: false,
            data: { object: { id: "re_1" } },
        });
        const staleSignature = await stripeSignature(stalePayload, "whsec_test_123");
        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": staleSignature },
                body: stalePayload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "pending-refund-stale-event",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("refunds")[0]).toMatchObject({ status: "succeeded" });
        expect(
            harness.rest
                .rows("commerce_projection_outbox")
                .filter((row) => String(row.projection_key).startsWith("refund:")),
        ).toHaveLength(2);
    });

    test("keeps one nonterminal refund per payment and releases the reservation after failure", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "order-pending-refund-failure",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.setNextRefundStatus("pending");
        const firstBody = {
            paymentId: created.paymentId,
            refundRequestId: "refund-pending-failure",
            commerceRefundRequestId: 902,
            amount: 300,
            authorizedSellerAmount: 780,
            sellerEntitlementReductionAmount: 300,
            reason: "first pending refund",
        };
        await okJson(await sourceJson(harness, "requestProtectedRefund", firstBody));

        const second = await sourceJson(harness, "requestProtectedRefund", {
            ...firstBody,
            refundRequestId: "refund-must-wait",
            commerceRefundRequestId: 903,
            authorizedSellerAmount: 480,
        });
        expect(second.status).toBe(409);
        expect(harness.rest.moneyCallOrder.filter((call) => call === "refund")).toHaveLength(1);

        harness.rest.updateProviderRefund("re_1", { status: "failed", failure_reason: "provider_declined" });
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "pending-refund-provider-failed",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("refunds")[0]).toMatchObject({ status: "failed" });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                operation_type: "refund_create",
                status: "failed",
            }),
        );
        expect(harness.rest.rows("commerce_projection_outbox")).toContainEqual(
            expect.objectContaining({
                projection_key: expect.stringContaining(":failed"),
                projection_payload: expect.objectContaining({ status: "failed" }),
            }),
        );
    });

    registerDisputeRecoverySourceScenarios(createHarness);

    test("verifies and durably deduplicates raw Stripe webhooks", async () => {
        const harness = await createHarness();
        const payload = JSON.stringify({
            id: "evt_unknown_1",
            type: "test_helpers.test_clock.ready",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: "clock_1" } },
        });
        const signature = await stripeSignature(payload, "whsec_test_123");
        const url = `${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`;
        const invalid = await harness.edgeRequest(
            new Request(url, {
                method: "POST",
                headers: { "stripe-signature": "t=1,v1=bad" },
                body: payload,
            }),
        );
        expect(invalid.status).toBe(400);

        const first = await harness.edgeRequest(
            new Request(url, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        const repeated = await harness.edgeRequest(
            new Request(url, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        expect(first.status).toBe(202);
        expect(repeated.status).toBe(200);
        expect(await repeated.json()).toEqual({ received: true, duplicate: true });
        expect(harness.rest.rows("stripe_events")).toHaveLength(1);

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "stripe-reconciliation-1",
                limit: 25,
            }),
        );
        expect(reconciliation).toMatchObject({
            runKey: "stripe-reconciliation-1",
            status: "succeeded",
            scannedCount: 1,
            repairedCount: 0,
            exceptionCount: 0,
            details: { processedStripeEvents: 1, recoveredFinancialOperations: 0 },
        });
        expect(harness.rest.rows("stripe_events")[0]).toMatchObject({
            processing_status: "ignored",
            attempt_count: 1,
            processing_started_at: null,
        });
    });

    test("uses a distinct signing secret and route for connected-account events", async () => {
        const harness = await createHarness();
        const payload = JSON.stringify({
            id: "evt_connect_account_1",
            type: "account.updated",
            account: "acct_connected_1",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: "acct_connected_1" } },
        });
        const platformSignature = await stripeSignature(payload, "whsec_test_123");
        const connectSignature = await stripeSignature(payload, "whsec_connect_test_456");
        const connectUrl = `${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe-connect`;
        const platformUrl = `${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`;

        const wrongSecret = await harness.edgeRequest(
            new Request(connectUrl, {
                method: "POST",
                headers: { "stripe-signature": platformSignature },
                body: payload,
            }),
        );
        const wrongScope = await harness.edgeRequest(
            new Request(platformUrl, {
                method: "POST",
                headers: { "stripe-signature": platformSignature },
                body: payload,
            }),
        );
        const accepted = await harness.edgeRequest(
            new Request(connectUrl, {
                method: "POST",
                headers: { "stripe-signature": connectSignature },
                body: payload,
            }),
        );

        expect(wrongSecret.status).toBe(400);
        expect(wrongScope.status).toBe(400);
        expect(accepted.status).toBe(202);
        expect(harness.rest.rows("stripe_events")).toContainEqual(
            expect.objectContaining({
                stripe_account_id: "acct_connected_1",
                event_id: "evt_connect_account_1",
                event_type: "account.updated",
            }),
        );
    });

    test("retrieves current Accounts v2 state from a signed thin event", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        harness.rest.setStripeAccountState("seller-1", {
            requirements: {
                entries: [
                    {
                        awaiting_action_from: "user",
                        description: "identity.individual.documents.primary_verification",
                        errors: [],
                        minimum_deadline: { status: "currently_due" },
                    },
                ],
                summary: { minimum_deadline: { status: "currently_due" } },
            },
        });
        const payload = JSON.stringify({
            id: "evt_v2_requirements_1",
            object: "v2.core.event",
            type: "v2.core.account[requirements].updated",
            created: new Date().toISOString(),
            livemode: false,
            context: "acct_seller_example_com",
            related_object: {
                id: "acct_seller_example_com",
                type: "v2.core.account",
                url: "/v2/core/accounts/acct_seller_example_com",
            },
        });
        const signature = await stripeSignature(payload, "whsec_connect_v2_test_789");

        const ingested = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe-connect-v2`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "accounts-v2-thin-event",
                limit: 25,
            }),
        );

        expect(ingested.status).toBe(202);
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            stripe_account_api_version: "v2",
            application_controlled_recipient: true,
            onboarding_status: "requirements_due",
            requirements_currently_due: ["identity.individual.documents.primary_verification"],
        });
        expect(harness.rest.rows("stripe_events")[0]).toMatchObject({
            stripe_account_id: "acct_seller_example_com",
            object_id: "acct_seller_example_com",
            event_type: "v2.core.account[requirements].updated",
            processing_status: "processed",
        });
    });

    registerPayoutSourceScenarios(createHarness);

    test("reclaims a Stripe webhook abandoned by a crashed worker", async () => {
        const harness = await createHarness();
        harness.rest.seedAbandonedStripeEvent();

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "reclaim-abandoned-webhook",
                limit: 5,
            }),
        );

        expect(reconciliation).toMatchObject({ scannedCount: 1, exceptionCount: 0 });
        expect(harness.rest.rows("stripe_events")[0]).toMatchObject({
            processing_status: "ignored",
            processing_started_at: null,
            attempt_count: 2,
        });

        const schema = await Bun.file(
            new URL("../integrations/stripe-connect/versions/1.0.0/connectors/supabase/schema.sql", import.meta.url),
        ).text();
        expect(schema).toContain("event.processing_status = 'processing'");
        expect(schema).toContain("event.processing_started_at <= now() - interval '5 minutes'");
        expect(schema).toContain("processing_started_at = now()");
    });

    registerPaymentRecoverySourceScenarios(createHarness);

    test("cancels a reconfirmable PaymentIntent idempotently before Commerce can restore inventory", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "cancel-during-confirmation",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );

        const first = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "cancel-during-confirmation",
                cancellationRequestId: "commerce-cancellation-1",
                reason: "buyer cancelled during confirmation",
            }),
        );
        const replay = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "cancel-during-confirmation",
                cancellationRequestId: "commerce-cancellation-1",
                reason: "buyer cancelled during confirmation",
            }),
        );

        expect(first).toMatchObject({
            cancellationRequestId: "commerce-cancellation-1",
            providerStatus: "canceled",
            payment: { paymentId: created.paymentId, paymentStatus: "cancelled" },
        });
        expect(replay).toMatchObject({ providerOperationId: first.providerOperationId, providerStatus: "canceled" });
        expect(
            harness.rest.rows("financial_operations").filter((row) => row.operation_type === "payment_intent_cancel"),
        ).toEqual([expect.objectContaining({ status: "succeeded", stripe_object_id: created.stripePaymentIntentId })]);
    });

    test("recovers a lost PaymentIntent cancellation response without creating a second cancellation", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "lost-cancel-response",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.losePaymentCancellationResponseOnce();
        const lost = await sourceJson(harness, "cancelProtectedPayment", {
            clientReferenceId: "lost-cancel-response",
            cancellationRequestId: "commerce-cancellation-lost-1",
            reason: "deadline elapsed",
        });
        expect(lost.status).toBeGreaterThanOrEqual(500);

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "recover-lost-payment-cancellation",
                limit: 25,
            }),
        );

        expect(reconciliation.payments).toContainEqual(
            expect.objectContaining({
                paymentId: created.paymentId,
                paymentStatus: "cancelled",
            }),
        );
        expect(
            harness.rest.rows("financial_operations").filter((row) => row.operation_type === "payment_intent_cancel"),
        ).toEqual([expect.objectContaining({ status: "succeeded", stripe_object_id: created.stripePaymentIntentId })]);
    });

    test("keeps payment_failed reconfirmable and reports a cancellation race as late success", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "failed-then-reconfirm",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        const failedPayload = JSON.stringify({
            id: "evt_reconfirmable_payment_failed",
            type: "payment_intent.payment_failed",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: paymentIntentId } },
        });
        const failedSignature = await stripeSignature(failedPayload, "whsec_test_123");
        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": failedSignature },
                body: failedPayload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "reconfirmable-payment-failed",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("payments")[0]).toMatchObject({ payment_status: "created" });

        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        const late = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "failed-then-reconfirm",
                cancellationRequestId: "commerce-cancellation-late-success",
                reason: "buyer cancelled while reconfirming",
            }),
        );
        expect(late).toMatchObject({
            providerStatus: "succeeded",
            payment: { paymentStatus: "succeeded", stripeChargeId: "ch_1" },
        });
        expect(harness.rest.rows("payment_events")).toContainEqual(
            expect.objectContaining({
                event_type: "payment_intent_cancellation_found_late_success",
            }),
        );
    });

    test("keeps Stripe dispute submission and acceptance locally irreversible", async () => {
        const harness = await createHarness();
        harness.rest.seedDispute("dp_stage", "needs_response", "not_started", false);
        harness.rest.seedDispute("dp_submitted", "needs_response", "submitted", true);
        harness.rest.seedDispute("dp_terminal", "won", "closed", false);

        const missingRole = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/exceptions`, {
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
                    "x-cms-user-id": "operator",
                },
            }),
        );
        const adminList = await sourceRequestWithRole(harness, "admin-1", "admin", "listProviderExceptions");
        const supportList = await sourceRequestWithRole(harness, "operator", "support", "listProviderExceptions");
        const financeList = await sourceRequestWithRole(harness, "operator", "finance", "listProviderExceptions");
        const stagedByAdmin = await sourceJsonWithRole(harness, "admin-1", "admin", "stageStripeDisputeEvidence", {
            disputeId: "dp_stage",
            evidenceOperationId: "admin-stage-1",
            evidenceText: "Tracked shipment evidence",
        });
        const stagedBySupport = await sourceJsonWithRole(
            harness,
            "support-1",
            "support",
            "stageStripeDisputeEvidence",
            {
                disputeId: "dp_stage",
                evidenceOperationId: "support-stage-1",
                evidenceText: "Tracked shipment evidence",
            },
        );
        const supportSubmission = await sourceJsonWithRole(
            harness,
            "support-1",
            "support",
            "submitStripeDisputeEvidence",
            {
                disputeId: "dp_submitted",
                submissionOperationId: "support-submit",
                evidenceOperationId: "evidence-dp_submitted",
                confirmation: "SUBMIT STRIPE EVIDENCE",
            },
        );
        const resubmission = await sourceJsonWithRole(harness, "admin-1", "admin", "submitStripeDisputeEvidence", {
            disputeId: "dp_submitted",
            submissionOperationId: "submit-again",
            evidenceOperationId: "evidence-dp_submitted",
            confirmation: "SUBMIT STRIPE EVIDENCE",
        });
        const adminAcceptance = await sourceJsonWithRole(harness, "admin-1", "admin", "acceptStripeDispute", {
            disputeId: "dp_terminal",
            acceptanceOperationId: "admin-accept-terminal",
            confirmation: "ACCEPT STRIPE DISPUTE",
        });
        const financeAcceptance = await sourceJsonWithRole(harness, "finance-1", "finance", "acceptStripeDispute", {
            disputeId: "dp_terminal",
            acceptanceOperationId: "accept-terminal",
            confirmation: "ACCEPT STRIPE DISPUTE",
        });

        expect(missingRole.status).toBe(403);
        expect(adminList.status).toBe(200);
        expect(supportList.status).toBe(403);
        expect(financeList.status).toBe(403);
        expect(stagedByAdmin.status).toBe(200);
        expect(stagedBySupport.status).toBe(403);
        expect(supportSubmission.status).toBe(403);
        expect(resubmission.status).toBe(409);
        expect(await jsonBody(resubmission)).toEqual({
            error: "Stripe dispute evidence was already submitted irreversibly",
        });
        expect(adminAcceptance.status).toBe(409);
        expect(await jsonBody(adminAcceptance)).toEqual({ error: "Stripe dispute is already terminal" });
        expect(financeAcceptance.status).toBe(403);
        expect(harness.rest.rows("financial_operations")).toHaveLength(0);
        expect(harness.rest.rows("payment_events")).toContainEqual(
            expect.objectContaining({
                event_type: "stripe_dispute_evidence_staged",
                actor_kind: "admin",
                actor_id: "admin-1",
            }),
        );
    });

    test("requires two distinct admins above the immutable Commerce threshold", async () => {
        const harness = await createHarness();
        harness.rest.seedDispute("dp_dual_submit", "needs_response", "staged", false);
        harness.rest.seedDispute("dp_dual_accept", "needs_response", "not_started", false);

        const submitBody = {
            disputeId: "dp_dual_submit",
            submissionOperationId: "submit-dual-1",
            evidenceOperationId: "evidence-dp_dual_submit",
            confirmation: "SUBMIT STRIPE EVIDENCE",
        };
        const firstSubmit = await sourceJsonWithRole(
            harness,
            "admin-1",
            "admin",
            "submitStripeDisputeEvidence",
            submitBody,
        );
        const repeatedFirstSubmit = await sourceJsonWithRole(
            harness,
            "admin-1",
            "admin",
            "submitStripeDisputeEvidence",
            submitBody,
        );
        const secondSubmit = await sourceJsonWithRole(
            harness,
            "admin-2",
            "admin",
            "submitStripeDisputeEvidence",
            submitBody,
        );

        const acceptBody = {
            disputeId: "dp_dual_accept",
            acceptanceOperationId: "accept-dual-1",
            confirmation: "ACCEPT STRIPE DISPUTE",
        };
        const firstAccept = await sourceJsonWithRole(harness, "admin-3", "admin", "acceptStripeDispute", acceptBody);
        const secondAccept = await sourceJsonWithRole(harness, "admin-4", "admin", "acceptStripeDispute", acceptBody);

        expect(firstSubmit.status).toBe(202);
        expect(repeatedFirstSubmit.status).toBe(202);
        expect(await jsonBody(firstSubmit)).toMatchObject({
            approvalStatus: "pending_second_approval",
            firstApprovedBy: "admin-1",
        });
        expect(secondSubmit.status).toBe(200);
        expect(await jsonBody(secondSubmit)).toMatchObject({ evidenceStatus: "submitted", approvalStatus: "approved" });
        expect(firstAccept.status).toBe(202);
        expect(secondAccept.status).toBe(200);
        expect(await jsonBody(secondAccept)).toMatchObject({ evidenceStatus: "accepted", approvalStatus: "approved" });
        expect(harness.rest.rows("irreversible_dispute_action_approvals")).toEqual([
            expect.objectContaining({
                first_actor_kind: "admin",
                first_actor_id: "admin-1",
                second_actor_kind: "admin",
                second_actor_id: "admin-2",
                status: "approved",
            }),
            expect.objectContaining({
                first_actor_kind: "admin",
                first_actor_id: "admin-3",
                second_actor_kind: "admin",
                second_actor_id: "admin-4",
                status: "approved",
            }),
        ]);
        expect(harness.rest.rows("payment_events")).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    event_type: "stripe_dispute_evidence_submitted",
                    actor_kind: "admin",
                    actor_id: "admin-2",
                }),
                expect.objectContaining({
                    event_type: "stripe_dispute_accepted",
                    actor_kind: "admin",
                    actor_id: "admin-4",
                }),
            ]),
        );
    });

    test("recursively redacts provider secrets from listed financial operations", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "redacted-operation-order",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );

        const listed = await sourceRequestWithRole(harness, "admin-1", "admin", "listFinancialOperations");
        const serialized = JSON.stringify(await okJson(listed));
        expect(serialized).not.toContain("client_secret");
        expect(serialized).not.toContain("clientSecret");
        expect(serialized).not.toContain("pi_1_secret");
    });

    registerAccountSourceScenarios(createHarness);
});

async function createPaidPaymentWithReleases(
    clientReferenceId: string,
    releases: Array<{ id: string; kind: "initial" | "reserve"; amount: number }>,
): Promise<{ harness: Harness; created: JsonRecord }> {
    const harness = await createHarness();
    await okJson(
        await sourceJson(
            harness,
            "createConnectOnboardingSessionForUser",
            {
                email: "seller@example.com",
            },
            { userId: "seller-1" },
        ),
    );
    const created = await okJson(
        await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId,
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        }),
    );
    harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
    await okJson(
        await sourceRequest(harness, "getProtectedPayment", {
            paymentId: String(created.paymentId),
        }),
    );
    for (const release of releases) {
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: release.id,
                releaseKind: release.kind,
                amount: release.amount,
                currency: "eur",
            }),
        );
    }
    return { harness, created };
}

function widgetById(widgets: JsonRecord[] | undefined, id: string): JsonRecord | undefined {
    const stack = [...(widgets ?? [])];
    while (stack.length) {
        const next = stack.shift()!;
        if (next.id === id) {
            return next;
        }
        if (Array.isArray(next.children)) {
            stack.push(...(next.children as JsonRecord[]));
        }
        if (Array.isArray(next.tabs)) {
            for (const tab of next.tabs as Array<{ children?: JsonRecord[] }>) {
                if (Array.isArray(tab.children)) {
                    stack.push(...tab.children);
                }
            }
        }
    }
    return undefined;
}

function filterValues(widget: JsonRecord | undefined, filterId: string): string[] {
    const filters = Array.isArray(widget?.filters) ? (widget.filters as JsonRecord[]) : [];
    const filter = filters.find((candidate) => candidate.id === filterId);
    const options = Array.isArray(filter?.options) ? (filter.options as JsonRecord[]) : [];
    return options.map((option) => String(option.value));
}

const createDashboardReadHarness = async () => {
    const harness = await createHarness();
    return {
        rest: harness.rest,
        request: async (
            userId: string,
            role: string | undefined,
            endpoint: string,
            params: Record<string, string> = {},
        ) => await sourceRequestWithRole(harness, userId, role, endpoint, params),
    };
};

const createPaymentProjectionHarness = async () => {
    const harness = await createHarness();
    return {
        rest: harness.rest,
        request: async (userId: string, endpoint: string, params: Record<string, string> = {}) =>
            await sourceRequestWithUser(harness, userId, endpoint, params),
        submit: async (userId: string, endpoint: string, body: unknown, params: Record<string, string> = {}) =>
            await sourceJsonWithUser(harness, userId, endpoint, body, params),
    };
};

const createPaymentCancellationHarness = async () => {
    const harness = await createHarness();
    return {
        rest: harness.rest,
        submit: async (userId: string, endpoint: string, body: unknown, params: Record<string, string> = {}) =>
            await sourceJsonWithUser(harness, userId, endpoint, body, params),
    };
};

const createProviderReconciliationHarness = async () => {
    const harness = await createHarness();
    return {
        rest: harness.rest,
        run: async (runKey: string, limit = 50) =>
            await sourceJson(harness, "runProviderReconciliation", { runKey, limit }),
        submit: async (userId: string, endpoint: string, body: unknown, params: Record<string, string> = {}) =>
            await sourceJsonWithUser(harness, userId, endpoint, body, params),
    };
};

const createProviderBoundaryHarness = async () => {
    const harness = await createHarness();
    return {
        apiKey: activeEnv.CMS_STRIPE_CONNECT_API_KEY ?? "",
        rest: harness.rest,
        edgeRequest: async (request: Request) => await harness.edgeRequest(request),
        request: async (
            userId: string,
            role: string | undefined,
            endpoint: string,
            params: Record<string, string> = {},
        ) => await sourceRequestWithRole(harness, userId, role, endpoint, params),
        submit: async (userId: string, role: string | undefined, endpoint: string, body: unknown) =>
            await sourceJsonWithRole(harness, userId, role, endpoint, body),
    };
};

const createRepositoryBoundaryHarness = async () => {
    const harness = await createHarness();
    return {
        rest: harness.rest,
        submit: async (userId: string, role: string | undefined, endpoint: string, body: unknown) =>
            await sourceJsonWithRole(harness, userId, role, endpoint, body),
    };
};

const createRoutingHarness = async () => {
    const harness = await createHarness();
    return {
        apiKey: activeEnv.CMS_STRIPE_CONNECT_API_KEY ?? "",
        rest: harness.rest,
        edgeRequest: async (request: Request) => await harness.edgeRequest(request),
        providerRequestCount: () => harness.rest.stripeRequests.length,
        request: async (
            userId: string,
            role: string | undefined,
            endpoint: string,
            params: Record<string, string> = {},
        ) => await sourceRequestWithRole(harness, userId, role, endpoint, params),
        submit: async (userId: string, role: string | undefined, endpoint: string, body: unknown) =>
            await sourceJsonWithRole(harness, userId, role, endpoint, body),
    };
};

const createAccountHandlerHarness = async () => {
    const harness = await createHarness();
    return {
        apiKey: activeEnv.CMS_STRIPE_CONNECT_API_KEY ?? "",
        rest: harness.rest,
        edgeRequest: async (request: Request) => await harness.edgeRequest(request),
        submit: async (userId: string, role: string | undefined, endpoint: string, body: unknown) =>
            await sourceJsonWithRole(harness, userId, role, endpoint, body),
    };
};

registerRefundAndDisputeDashboardContracts(createDashboardReadHarness);
registerOperationAndExceptionDashboardContracts(createDashboardReadHarness);
registerPaymentDashboardContracts(createDashboardReadHarness);
registerAccountProviderBoundaryContracts(createProviderBoundaryHarness);
registerDisputeApplicationReadContextContracts(createProviderBoundaryHarness);
registerDisputeApprovalContracts(createProviderBoundaryHarness);
registerDisputeApprovalCompletionContracts(createProviderBoundaryHarness);
registerDisputeApprovalFailureContracts(createProviderBoundaryHarness);
registerDisputeApprovalSubmissionContracts(createProviderBoundaryHarness);
registerDisputeFileProviderBoundaryContracts(createProviderBoundaryHarness);
registerDisputeStagingContracts(createProviderBoundaryHarness);
registerProtectedPaymentFailureContracts(createProviderBoundaryHarness);
registerPlatformPayoutProtectionFailureContracts(createProviderBoundaryHarness);
registerPlatformPayoutProtectionValidationContracts(createProviderBoundaryHarness);
registerPlatformPayoutProtectionWorkflowContracts(createProviderBoundaryHarness);
registerProtectedPaymentPayoutContracts(createProviderBoundaryHarness);
registerProtectedPaymentProjectionRaceContracts(createProviderBoundaryHarness);
registerProtectedPaymentReservationContracts(createProviderBoundaryHarness);
registerProtectedPaymentReplayContracts(createProviderBoundaryHarness);
registerProtectedRefundFailureContracts(createProviderBoundaryHarness);
registerProtectedRefundRecoveryContracts(createProviderBoundaryHarness);
registerProtectedRefundReplayContracts(createProviderBoundaryHarness);
registerProtectedRefundSellerRecoveryContracts(createProviderBoundaryHarness);
registerProtectedRefundSuccessContracts(createProviderBoundaryHarness);
registerProtectedRefundProjectionInterleavingContracts(createProviderBoundaryHarness);
registerProtectedRefundProjectionStatusContracts(createProviderBoundaryHarness);
registerProtectedRefundPreflightInterleavingContracts(createProviderBoundaryHarness);
registerProtectedRefundValidationContracts(createProviderBoundaryHarness);
registerTransferReversalCompletionSnapshotContracts(createProviderBoundaryHarness);
registerTransferReversalFailureContracts(createProviderBoundaryHarness);
registerTransferReversalRecoveryContracts(createProviderBoundaryHarness);
registerTransferReversalSuccessContracts(createProviderBoundaryHarness);
registerAccountTermsRepositoryContracts(createRepositoryBoundaryHarness);
registerProtectedPaymentEligibilityContracts(createRepositoryBoundaryHarness);
registerLedgerRepositoryContracts(createRepositoryBoundaryHarness);
registerPaymentOperationRepositoryContracts(createRepositoryBoundaryHarness);
registerPaymentProjectionContracts(createPaymentProjectionHarness);
registerPaymentProjectionFailureContracts(createPaymentProjectionHarness);
registerPaymentProjectionReplayContracts(createPaymentProjectionHarness);
registerPaymentCancellationReplayContracts(createPaymentCancellationHarness);
registerPaymentCancellationRecoveryContracts(createPaymentCancellationHarness);
registerPaymentCancellationFailureContracts(createPaymentCancellationHarness);
registerPaymentCancellationReservationContracts(createPaymentCancellationHarness);
registerProviderReconciliationContracts(createProviderReconciliationHarness);
registerProviderReconciliationBudgets(createProviderReconciliationHarness);
registerProviderExceptionResolutionContracts(createProviderReconciliationHarness);
registerPaymentReconciliationLedgerContracts(createProviderReconciliationHarness);
registerPaymentReconciliationLedgerDivergenceContracts(createProviderReconciliationHarness);
registerPaymentReconciliationProviderFailureContracts(createProviderReconciliationHarness);
registerStalePaymentLocalContextContracts(createProviderReconciliationHarness);
registerStalePaymentLocalContextFailureContracts(createProviderReconciliationHarness);
registerProviderTransferContextContracts(createProviderReconciliationHarness);
registerProviderTransferContextFailureContracts(createProviderReconciliationHarness);
registerTerminalOperationRecoveryContracts(createProviderReconciliationHarness);
registerSettlementReleaseValidationContracts(createProviderReconciliationHarness);
registerSettlementReleaseRecoveryContracts(createProviderReconciliationHarness);
registerSettlementReleaseFailureContracts(createProviderReconciliationHarness);
registerSettlementReleaseReplayContracts(createProviderReconciliationHarness);
registerSettlementReleaseReadOrderContracts(createProviderReconciliationHarness);
registerSettlementReleaseLedgerFreshnessContracts(createProviderReconciliationHarness);
registerStripeConnectRoutingContracts(createRoutingHarness);
registerPaymentReconciliationRoutingContracts(createRoutingHarness);
registerProviderReconciliationRunRoutingContracts(createRoutingHarness);
registerProtectedPaymentValidationContracts(createRoutingHarness);
registerProtectedPaymentReadContracts(createRoutingHarness);
registerStripeWebhookPersistenceContracts(createRoutingHarness);
registerStripeWebhookCoreProcessingContracts(createRoutingHarness);
registerStripeWebhookMoneyProcessingContracts(createRoutingHarness);
registerStripeWebhookValidationContracts(createRoutingHarness);
registerAccountOnboardingContracts(createAccountHandlerHarness);
registerAccountEnrollmentContracts(createAccountHandlerHarness);
registerAccountLifecycleContracts(createAccountHandlerHarness);
registerPayoutScheduleContracts(createAccountHandlerHarness);
registerPayoutScheduleFailureContracts(createAccountHandlerHarness);
registerPayoutScheduleConcurrencyContracts(createAccountHandlerHarness);
registerPayoutScheduleCleanupContracts(createAccountHandlerHarness);
registerPayoutScheduleRiskContracts(createAccountHandlerHarness);
registerPayoutScheduleValidationContracts(createAccountHandlerHarness);
