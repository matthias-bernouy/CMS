import { afterAll, describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { handleSourceRequest, InMemorySourceRepository, type SourceRepository } from "@bernouy/cms-sources";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemoryRolesRepository, USER_ROLE } from "@bernouy/cms-permissions";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { registerAccountEnrollmentContracts } from "./stripe-connect/accounts/enrollment.contracts";
import { registerAccountLifecycleContracts } from "./stripe-connect/accounts/lifecycle.contracts";
import { registerAccountOnboardingContracts } from "./stripe-connect/accounts/onboarding.contracts";
import { registerOperationAndExceptionDashboardContracts } from "./stripe-connect/dashboard/operations-exceptions.contracts";
import { registerPaymentProjectionContracts } from "./stripe-connect/payment-projection/contracts";
import { registerPaymentProjectionFailureContracts } from "./stripe-connect/payment-projection/failures";
import { registerPaymentProjectionReplayContracts } from "./stripe-connect/payment-projection/replay";
import { registerPaymentCancellationFailureContracts } from "./stripe-connect/payment-cancellation/failures.contracts";
import { registerPaymentCancellationRecoveryContracts } from "./stripe-connect/payment-cancellation/recovery.contracts";
import { registerPaymentCancellationReplayContracts } from "./stripe-connect/payment-cancellation/replay.contracts";
import { registerAccountProviderBoundaryContracts } from "./stripe-connect/provider-boundary/accounts.contracts";
import { registerDisputeFileProviderBoundaryContracts } from "./stripe-connect/provider-boundary/dispute-files.contracts";
import { registerAccountTermsRepositoryContracts } from "./stripe-connect/repository-boundary/accounts-terms.contracts";
import { registerLedgerRepositoryContracts } from "./stripe-connect/repository-boundary/ledger.contracts";
import { registerPaymentOperationRepositoryContracts } from "./stripe-connect/repository-boundary/payments-operations.contracts";
import { registerProviderReconciliationBudgets } from "./stripe-connect/provider-reconciliation/budgets";
import { registerProviderReconciliationContracts } from "./stripe-connect/provider-reconciliation/contracts";
import { registerProviderExceptionResolutionContracts } from "./stripe-connect/provider-reconciliation/exception-resolution";
import { registerStripeConnectRoutingContracts } from "./stripe-connect/routing/contracts";
import { registerPaymentReconciliationLedgerContracts } from "./stripe-connect/provider-reconciliation/payment-ledger/contracts";
import { registerPaymentReconciliationLedgerDivergenceContracts } from "./stripe-connect/provider-reconciliation/payment-ledger/divergence";
import { registerStalePaymentLocalContextContracts } from "./stripe-connect/provider-reconciliation/payment-ledger/stale-local-context";
import { registerStalePaymentLocalContextFailureContracts } from "./stripe-connect/provider-reconciliation/payment-ledger/stale-local-context-failures";
import { registerProviderTransferContextContracts } from "./stripe-connect/provider-reconciliation/provider-transfer-context/contracts";
import { registerProviderTransferContextFailureContracts } from "./stripe-connect/provider-reconciliation/provider-transfer-context/failures";
import { registerTerminalOperationRecoveryContracts } from "./stripe-connect/provider-reconciliation/operation-recovery/terminal-contracts";
import type {
    OperationRecoveryKind,
    TerminalOperationRecoverySeed,
} from "./stripe-connect/provider-reconciliation/harness";
import { registerRefundAndDisputeDashboardContracts } from "./stripe-connect/dashboard/refunds-disputes.contracts";
import type { DashboardTable, PostgrestRequestRecord } from "./stripe-connect/dashboard/dashboard-contract-harness";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;
type StripeRequestRecord = {
    method: string;
    pathname: string;
    searchParams: Array<[string, string]>;
    idempotencyKey: string | null;
    stripeAccount: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
    return isRecord(value) ? value : {};
}

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const stripeUrl = "https://api.stripe.com";
const edgeFunctionUrl =
    "../integrations/stripe-connect/versions/1.0.0/connectors/supabase/functions/cms-stripe-connect/index.ts";
const financialTermsHash = "a".repeat(64);
const marketplaceTermsHash = "c".repeat(64);
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

(
    globalThis as {
        Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown };
    }
).Deno = {
    env: { get: (key) => activeEnv[key] },
    serve(handler) {
        edgeHandler = handler;
        return {
            shutdown() {
                /* test stub */
            },
        };
    },
};
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

describe("stripe-connect 1.0.0 source", () => {
    test("persists seller recovery exposure and blocks payments, releases, and unsafe payouts", async () => {
        const root = resolve(import.meta.dir, "../integrations/stripe-connect/versions/1.0.0");
        const [schema, edge, paymentProjection, definition] = await Promise.all([
            readFile(resolve(root, "connectors/supabase/schema.sql"), "utf8"),
            readFile(resolve(root, "connectors/supabase/functions/cms-stripe-connect/index.ts"), "utf8"),
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

    test("reads and idempotently applies Commerce seller payout controls", async () => {
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

        const before = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));
        const command = {
            userId: "seller-1",
            payoutScheduleChangeId: "risk-policy-7:seller-1",
            interval: "weekly",
            weeklyPayoutDays: ["monday", "thursday"],
            minimumBalanceEur: 2500,
            delayDaysOverride: 7,
            debitNegativeBalances: true,
            reason: "Versioned Commerce seller risk policy 7",
        };
        const configured = await okJson(await sourceJson(harness, "configureSellerPayoutSchedule", command));
        const replayed = await okJson(await sourceJson(harness, "configureSellerPayoutSchedule", command));
        const mismatch = await sourceJson(harness, "configureSellerPayoutSchedule", {
            ...command,
            interval: "manual",
            weeklyPayoutDays: undefined,
        });

        expect(before).toMatchObject({ payoutControl: { interval: "daily" } });
        expect(configured).toMatchObject({
            payoutScheduleChangeId: "risk-policy-7:seller-1",
            payoutControl: {
                interval: "weekly",
                weeklyPayoutDays: ["monday", "thursday"],
                minimumBalanceByCurrency: { eur: 2500 },
                delayDaysOverride: 7,
                debitNegativeBalances: true,
            },
        });
        expect(replayed.providerOperationId).toBe(configured.providerOperationId);
        expect(harness.rest.balanceSettingsUpdateCount).toBe(1);
        expect(mismatch.status).toBe(409);
    });

    test("accepts Stripe omitting a zero payout minimum but rejects an omitted positive minimum", async () => {
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

        const zeroMinimum = await okJson(
            await sourceJson(harness, "configureSellerPayoutSchedule", {
                userId: "seller-1",
                payoutScheduleChangeId: "zero-minimum-canonicalized-by-stripe",
                interval: "weekly",
                weeklyPayoutDays: ["monday"],
                minimumBalanceEur: 0,
                delayDaysOverride: 14,
            }),
        );
        harness.rest.omitMinimumBalanceOnNextBalanceSettingsUpdate();
        const missingPositiveMinimum = await sourceJson(harness, "configureSellerPayoutSchedule", {
            userId: "seller-1",
            payoutScheduleChangeId: "missing-positive-minimum",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            minimumBalanceEur: 500,
            delayDaysOverride: 14,
        });

        expect(zeroMinimum).toMatchObject({
            payoutControl: {
                interval: "weekly",
                weeklyPayoutDays: ["monday"],
                minimumBalanceByCurrency: {},
                delayDaysOverride: 14,
            },
        });
        expect(missingPositiveMinimum.status).toBe(502);
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                business_key: "payout-schedule:seller-1:missing-positive-minimum",
                status: "manual_review",
            }),
        );
    });

    test("clears only its own false recovery hold after an exact provider-confirmed replay", async () => {
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
        const command = {
            userId: "seller-1",
            payoutScheduleChangeId: "lost-provider-confirmation",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            minimumBalanceEur: 0,
            delayDaysOverride: 14,
        };
        harness.rest.loseNextSellerPayoutSettingsResponse();

        const ambiguous = await sourceJson(harness, "configureSellerPayoutSchedule", command);
        expect(ambiguous.status).toBe(502);
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "manual_review",
            financial_hold_reason: "Seller recovery payout hold is not confirmed",
        });
        harness.rest.markFinancialOperationSucceeded("payout-schedule:seller-1:lost-provider-confirmation");

        const recovered = await okJson(await sourceJson(harness, "configureSellerPayoutSchedule", command));
        expect(recovered).toMatchObject({
            account: {
                riskStatus: "standard",
                financialHoldReason: null,
            },
        });
        expect(await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectStatus"))).toMatchObject({
            canReceiveProtectedPayments: true,
        });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "standard",
            financial_hold_reason: null,
            payout_blocked_at: null,
        });

        harness.rest.setIndependentSellerRisk("seller-1", "Independent manual compliance review");
        const independentCommand = {
            ...command,
            payoutScheduleChangeId: "lost-provider-confirmation-independent-risk",
            weeklyPayoutDays: ["thursday"],
        };
        harness.rest.loseNextSellerPayoutSettingsResponse();
        expect((await sourceJson(harness, "configureSellerPayoutSchedule", independentCommand)).status).toBe(502);
        harness.rest.markFinancialOperationSucceeded(
            "payout-schedule:seller-1:lost-provider-confirmation-independent-risk",
        );
        harness.rest.setIndependentSellerRisk("seller-1", "Independent manual compliance review");

        const independentlyBlocked = await okJson(
            await sourceJson(harness, "configureSellerPayoutSchedule", independentCommand),
        );
        expect(independentlyBlocked).toMatchObject({
            account: {
                riskStatus: "manual_review",
                financialHoldReason: "Independent manual compliance review",
            },
        });
        expect(await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectStatus"))).toMatchObject({
            canReceiveProtectedPayments: false,
            riskStatus: "manual_review",
        });
    });

    test("replaces a concurrent weekly payout update with the newer seller risk hold", async () => {
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
        const pause = harness.rest.pauseNextSellerBalanceSettingsUpdate();
        const configuring = sourceJson(harness, "configureSellerPayoutSchedule", {
            userId: "seller-1",
            payoutScheduleChangeId: "weekly-racing-new-risk",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            reason: "Commerce policy before concurrent dispute",
        });

        await pause.entered;
        harness.rest.exposeSellerFinancialRisk("seller-1", 1080);
        pause.resume();
        const response = await configuring;
        const finalRisk = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));

        expect(response.status).toBe(409);
        expect(harness.rest.balanceSettingsUpdateCount).toBe(2);
        expect(await jsonBody(response)).toEqual({
            error: "payout schedule change was superseded by seller financial risk",
        });
        expect(finalRisk).toMatchObject({
            account: {
                payoutSchedule: "manual",
                riskStatus: "restricted",
                financialExposureAmount: 1080,
            },
            payoutControl: {
                interval: "manual",
                minimumBalanceByCurrency: { eur: 1080 },
            },
        });
    });

    test("restores the automatic seller payout schedule only after recovery exposure clears", async () => {
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
        harness.rest.seedEmergencySellerHold("seller-1", 0);

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-restore-cleared",
                limit: 25,
            }),
        );

        expect(reconciliation).toMatchObject({ repairedCount: 1, exceptionCount: 0 });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "daily",
            manual_payout_hold_started_at: null,
            manual_payout_hold_deadline_at: null,
            manual_payout_hold_restore_settings: null,
        });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                business_key: expect.stringContaining("seller-risk-restore:seller-1"),
                status: "succeeded",
            }),
        );
    });

    test("restores exact weekly and monthly seller payout settings after an emergency hold", async () => {
        for (const [name, restoreSettings, expected] of [
            [
                "weekly",
                {
                    interval: "weekly",
                    weeklyPayoutDays: ["monday", "thursday"],
                    minimumBalanceEur: 125,
                    debitNegativeBalances: true,
                },
                { interval: "weekly", weeklyPayoutDays: ["monday", "thursday"] },
            ],
            [
                "monthly",
                {
                    interval: "monthly",
                    monthlyPayoutDays: [1, 15],
                    minimumBalanceEur: 250,
                    debitNegativeBalances: false,
                },
                { interval: "monthly", monthlyPayoutDays: [1, 15] },
            ],
        ] as const) {
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
            harness.rest.seedEmergencySellerHold("seller-1", 0, restoreSettings);

            await okJson(
                await sourceJson(harness, "runProviderReconciliation", {
                    runKey: `seller-payout-restore-${name}`,
                    limit: 25,
                }),
            );
            const risk = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));

            expect(risk.payoutControl, name).toMatchObject(expected);
            expect(risk.account).toMatchObject({
                payoutSchedule: name,
                manualPayoutHoldStartedAt: null,
                manualPayoutHoldDeadlineAt: null,
            });
        }
    });

    test("preserves an exact pre-existing manual payout baseline through an emergency hold", async () => {
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
        harness.rest.setConnectedPayoutSettings("manual", 75);
        harness.rest.exposeSellerFinancialRisk("seller-1", 250);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-manual-baseline-hold",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("accounts")[0]?.manual_payout_hold_restore_settings).toEqual({
            interval: "manual",
            minimumBalanceEur: 75,
            debitNegativeBalances: false,
        });
        harness.rest.exposeSellerFinancialRisk("seller-1", 0);

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-restore-manual-baseline",
                limit: 25,
            }),
        );

        expect(reconciliation).toMatchObject({ exceptionCount: 0 });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "manual",
            manual_payout_hold_started_at: null,
            manual_payout_hold_deadline_at: null,
            manual_payout_hold_restore_settings: null,
        });
        const risk = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));
        expect(risk.payoutControl).toMatchObject({
            interval: "manual",
            minimumBalanceByCurrency: { eur: 75 },
        });
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });

    test("restores a seller payout baseline after Stripe committed a hold but the database response was lost", async () => {
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
        const operationId = harness.rest.seedFailedSellerRiskHoldOperation("seller-1", 250);

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-hold-operation-recovery-cleared-risk",
                limit: 25,
            }),
        );

        expect(reconciliation).toMatchObject({ exceptionCount: 0 });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                id: operationId,
                status: "succeeded",
            }),
        );
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "daily",
            provider_hold_minimum_amount: 250,
            manual_payout_hold_started_at: null,
            manual_payout_hold_restore_settings: null,
        });
        const risk = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));
        expect(risk.payoutControl).toMatchObject({
            interval: "daily",
            minimumBalanceByCurrency: {},
            debitNegativeBalances: false,
        });
    });

    test("does not let a Stripe event backlog starve money-operation recovery", async () => {
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
        const operationId = harness.rest.seedFailedSellerRiskHoldOperation("seller-1", 250);
        harness.rest.seedPendingStripeEvents(5);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "fair-reconciliation-with-event-backlog",
                limit: 5,
            }),
        );

        expect(harness.rest.rows("stripe_events").filter((row) => row.processing_status === "pending")).toHaveLength(4);
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                id: operationId,
                status: "succeeded",
            }),
        );
    });

    test("recovers a lost automatic seller payout restoration response", async () => {
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
        harness.rest.seedEmergencySellerHold("seller-1", 0);
        harness.rest.loseNextSellerPayoutSettingsResponse();

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-restore-lost-response",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "daily",
            manual_payout_hold_started_at: null,
        });
        expect(
            harness.rest
                .rows("financial_operations")
                .filter((row) => String(row.business_key).includes("seller-risk-restore:seller-1")),
        ).toHaveLength(1);
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });

    test("reapplies the emergency hold when new exposure races automatic restoration", async () => {
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
        harness.rest.seedEmergencySellerHold("seller-1", 0);
        harness.rest.addRiskDuringNextSellerAutomaticRestore();

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-restore-risk-race",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "manual",
            financial_exposure_amount: 250,
            provider_hold_minimum_amount: 250,
            manual_payout_hold_started_at: "2026-07-01T00:00:00.000Z",
        });
    });

    test("repairs provider drift while an emergency seller hold is active", async () => {
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
        harness.rest.seedEmergencySellerHold("seller-1", 250);
        harness.rest.setConnectedPayoutSettings("daily", 0);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-hold-provider-drift",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "manual",
            financial_exposure_amount: 250,
            provider_hold_minimum_amount: 250,
        });
        expect(harness.rest.rows("provider_exceptions")).not.toContainEqual(
            expect.objectContaining({
                exception_type: "seller_manual_payout_hold_drift",
            }),
        );
    });

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

    test("releases after Stripe closes a dispute without loss", async () => {
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
                clientReferenceId: "order-won-dispute-release",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.addProviderDispute("ch_1", { id: "dp_won_before_release", status: "won" });

        const release = await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-after-won-dispute",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        const payment = harness.rest.rows("payments")[0];

        expect(release).toMatchObject({ amount: 1080, status: "succeeded" });
        expect(payment).toMatchObject({ dispute_status: "won", settlement_status: "released" });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer"]);
    });

    test("blocks a refund when a seller Transfer becomes in flight after provider reconciliation", async () => {
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
                clientReferenceId: "order-transfer-races-refund",
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
        harness.rest.injectInFlightTransferBeforeNextRefundReservation(Number(created.paymentId), 500);

        const response = await sourceJson(harness, "requestProtectedRefund", {
            paymentId: created.paymentId,
            refundRequestId: "refund-raced-by-transfer",
            commerceRefundRequestId: 81,
            amount: 1200,
            authorizedSellerAmount: 0,
            sellerEntitlementReductionAmount: 1080,
            reason: "full refund must observe concurrent Transfer",
        });

        expect(response.status).toBe(409);
        expect(await jsonBody(response)).toEqual({
            error: "required Transfer Reversal is not confirmed or a Transfer is in flight",
        });
        expect(harness.rest.rows("refunds")).toHaveLength(0);
        expect(harness.rest.moneyCallOrder).toEqual([]);
        expect(harness.rest.rows("transfers")[0]).toMatchObject({ status: "processing", amount: 500 });
    });

    test("keeps a won dispute blocked while withdrawn funds are not reinstated", async () => {
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
                clientReferenceId: "order-won-but-funds-withdrawn",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-before-funds-withdrawn",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.rejectTransferReversals();
        harness.rest.addProviderDispute("ch_1", { id: "dp_won_funds_withdrawn", status: "won" });
        const payload = JSON.stringify({
            id: "evt_dispute_funds_withdrawn",
            type: "charge.dispute.funds_withdrawn",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: "dp_won_funds_withdrawn" } },
        });
        const signature = await stripeSignature(payload, "whsec_test_123");
        const ingestion = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        expect(ingestion.status).toBe(202);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "won-dispute-without-funds-reinstated",
                limit: 25,
            }),
        );
        const payment = harness.rest.rows("payments")[0];
        const dispute = harness.rest.rows("stripe_disputes")[0];
        const exposure = harness.rest.rows("seller_recovery_exposures")[0];

        expect(payment).toMatchObject({
            dispute_status: "open",
            settlement_status: "manual_review",
        });
        expect(dispute).toMatchObject({ status: "won", funds_withdrawn: true });
        expect(exposure).toMatchObject({ status: "debt", amount: 1080, recovered_amount: 0 });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal"]);
    });

    test("orders dispute funds events monotonically and ignores stale or losing tie events", async () => {
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
                clientReferenceId: "order-dispute-funds-ordering",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.addProviderDispute("ch_1", { id: "dp_funds_ordering", status: "won" });

        const sendFundsEvent = async (eventId: string, eventType: string, createdAt: number, runKey: string) => {
            const payload = JSON.stringify({
                id: eventId,
                type: eventType,
                api_version: "2026-02-25.clover",
                created: createdAt,
                livemode: false,
                data: { object: { id: "dp_funds_ordering" } },
            });
            const signature = await stripeSignature(payload, "whsec_test_123");
            await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                    method: "POST",
                    headers: { "stripe-signature": signature },
                    body: payload,
                }),
            );
            await okJson(await sourceJson(harness, "runProviderReconciliation", { runKey, limit: 25 }));
        };

        const base = Math.floor(Date.now() / 1000) - 100;
        await sendFundsEvent(
            "evt_funds_withdrawn_new",
            "charge.dispute.funds_withdrawn",
            base + 20,
            "funds-withdrawn-new",
        );
        await sendFundsEvent(
            "evt_funds_reinstated_stale",
            "charge.dispute.funds_reinstated",
            base + 10,
            "funds-reinstated-stale",
        );
        expect(harness.rest.rows("stripe_disputes")[0]).toMatchObject({
            funds_withdrawn: true,
            last_funds_event_id: "evt_funds_withdrawn_new",
        });
        const blocked = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-blocked-by-current-funds-truth",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        expect(blocked.status).toBe(409);

        await sendFundsEvent(
            "evt_funds_a_withdrawn",
            "charge.dispute.funds_withdrawn",
            base + 30,
            "funds-tie-withdrawn-a",
        );
        await sendFundsEvent(
            "evt_funds_z_reinstated",
            "charge.dispute.funds_reinstated",
            base + 30,
            "funds-tie-reinstated-z",
        );
        await sendFundsEvent(
            "evt_funds_b_withdrawn",
            "charge.dispute.funds_withdrawn",
            base + 30,
            "funds-tie-withdrawn-b",
        );
        expect(harness.rest.rows("stripe_disputes")[0]).toMatchObject({
            funds_withdrawn: true,
            last_funds_event_id: "same-second-conflict",
        });

        await sendFundsEvent(
            "evt_funds_first_reinstated",
            "charge.dispute.funds_reinstated",
            base + 40,
            "funds-tie-reinstated-first",
        );
        await sendFundsEvent(
            "evt_funds_second_withdrawn",
            "charge.dispute.funds_withdrawn",
            base + 40,
            "funds-tie-withdrawn-second",
        );
        expect(harness.rest.rows("stripe_disputes")[0]).toMatchObject({
            funds_withdrawn: true,
            last_funds_event_id: "same-second-conflict",
        });
        const stillBlocked = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-blocked-by-same-second-conflict",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        expect(stillBlocked.status).toBe(409);
    });

    test("keeps an open dispute blocked after a successful seller Transfer Reversal", async () => {
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
                clientReferenceId: "order-open-dispute-after-release",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-before-open-dispute",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.addProviderDispute("ch_1", { id: "dp_open_after_release", status: "needs_response" });

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "open-dispute-reversal-remains-blocked",
                limit: 25,
            }),
        );
        const payment = harness.rest.rows("payments")[0];

        expect(payment).toMatchObject({
            dispute_status: "open",
            settlement_status: "manual_review",
            transferred_amount: 1080,
            reversed_amount: 1080,
            manual_review_reason: "Stripe dispute dp_open_after_release after Transfer",
        });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal"]);
    });

    test("records a lost dispute as seller debt instead of transient exposure", async () => {
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
                clientReferenceId: "order-lost-dispute-debt",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-before-lost-dispute",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.addProviderDispute("ch_1", { id: "dp_lost_after_release", status: "lost" });

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "lost-dispute-records-debt",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payments")[0]).toMatchObject({
            dispute_status: "lost",
            settlement_status: "manual_review",
        });
        expect(harness.rest.rows("seller_recovery_exposures")[0]).toMatchObject({
            exposure_type: "chargeback",
            status: "debt",
            amount: 1080,
            recovered_amount: 0,
        });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer"]);
    });

    test("releases one exact platform-balance recovery after a reversed dispute is won", async () => {
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
                clientReferenceId: "order-dispute-recovery-release",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-before-recovery-dispute",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.addProviderDispute("ch_1", {
            id: "dp_recovery_release",
            status: "needs_response",
        });
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "recovery-dispute-open",
                limit: 25,
            }),
        );
        harness.rest.updateProviderDispute("dp_recovery_release", { status: "won" });
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "recovery-dispute-won",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            outstanding_debt_amount: 0,
            financial_exposure_amount: 0,
            payout_schedule: "daily",
            manual_payout_hold_started_at: null,
            manual_payout_hold_alert_at: null,
            manual_payout_hold_deadline_at: null,
            manual_payout_hold_restore_settings: null,
        });

        const recoveryBody = {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-recovery-after-won",
            releaseKind: "recovery",
            amount: 1080,
            currency: "eur",
        };
        const recovery = await okJson(await sourceJson(harness, "requestSettlementRelease", recoveryBody));
        const repeated = await okJson(await sourceJson(harness, "requestSettlementRelease", recoveryBody));
        const payment = harness.rest.rows("payments")[0];

        expect(recovery).toMatchObject({
            releaseAuthorizationId: "release-recovery-after-won",
            releaseKind: "recovery",
            amount: 1080,
            status: "succeeded",
        });
        expect(repeated).toMatchObject({ stripeTransferId: recovery.stripeTransferId });
        expect(harness.rest.lastTransferParameters).toMatchObject({
            amount: "1080",
            "metadata[cms_release_authorization_id]": "release-recovery-after-won",
            "metadata[cms_release_kind]": "recovery",
        });
        expect(harness.rest.lastTransferParameters).not.toHaveProperty("source_transaction");
        expect(payment).toMatchObject({
            dispute_status: "won",
            settlement_status: "released",
            transferred_amount: 2160,
            reversed_amount: 1080,
        });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal", "transfer"]);
    });

    test("blocks the same release call when reconciliation finds arithmetic divergence", async () => {
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
                clientReferenceId: "order-arithmetic-divergence",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.seedSucceededTransfer(created.paymentId, 1200);

        const release = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-must-not-continue-after-divergence",
            releaseKind: "initial",
            amount: 1,
            currency: "eur",
        });
        const payment = harness.rest.rows("payments")[0];

        expect(release.status).toBe(409);
        expect(await jsonBody(release)).toEqual({
            error: "provider ledger arithmetic divergence requires finance review",
        });
        expect(payment).toMatchObject({
            settlement_status: "manual_review",
            manual_review_reason: "provider ledger arithmetic divergence",
        });
        expect(harness.rest.moneyCallOrder).toEqual([]);
    });

    test("blocks release when provider reconciliation discovers a missing dispute webhook", async () => {
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
                clientReferenceId: "order-missing-dispute-webhook",
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
        harness.rest.addProviderDispute("ch_1");

        const release = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-missing-dispute-webhook",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        const payment = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(release.status).toBe(409);
        expect(await jsonBody(release)).toEqual({
            error: "payment is blocked by an open, lost, or unresolved Stripe dispute",
        });
        expect(payment).toMatchObject({ disputeStatus: "open", settlementStatus: "blocked" });
        expect(harness.rest.moneyCallOrder).toEqual([]);
        const projectionRun = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "missing-dispute-webhook-projection",
                limit: 25,
            }),
        );
        expect(projectionRun.disputes).toContainEqual(
            expect.objectContaining({
                status: "needs_response",
                clientReferenceId: "order-missing-dispute-webhook",
                providerEventId: expect.stringContaining("dispute:"),
                projectionClaimToken: expect.stringContaining("claim-"),
            }),
        );
        const disputeProjection = (projectionRun.disputes as JsonRecord[]).find((dispute) => dispute.id === "dp_1")!;
        const disputeOutbox = harness.rest
            .rows("commerce_projection_outbox")
            .find((row) => same(row.id, disputeProjection.projectionId));
        expect(disputeProjection.providerEventId).toBe(disputeOutbox?.projection_key);
    });

    test("quarantines an out-of-band refund before any seller Transfer", async () => {
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
                clientReferenceId: "order-out-of-band-refund",
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
        harness.rest.addProviderRefund("ch_1");

        const release = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-out-of-band-refund",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        const payment = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(release.status).toBe(409);
        expect(await jsonBody(release)).toEqual({ error: "payment settlement is blocked or requires finance review" });
        expect(payment).toMatchObject({ settlementStatus: "manual_review" });
        expect(String(payment.manualReviewReason)).toContain("untracked Stripe refund");
        expect(harness.rest.moneyCallOrder).toEqual([]);

        harness.rest.clearProviderRefunds();
        harness.rest.addProviderDispute("ch_1", { id: "dp_won_after_manual_review", status: "won" });
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "won-dispute-must-not-clear-independent-manual-review",
                limit: 25,
            }),
        );
        const afterWonDispute = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );
        expect(afterWonDispute).toMatchObject({
            disputeStatus: "won",
            settlementStatus: "manual_review",
        });
        expect(String(afterWonDispute.manualReviewReason)).toContain("untracked Stripe refund");
    });

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

    test("accepts a normal automatic platform payout and records it without a critical exception", async () => {
        const harness = await createHarness();
        const payload = payoutEventPayload({
            eventId: "evt_platform_automatic_1",
            payoutId: "po_platform_automatic_1",
            automatic: true,
            method: "standard",
        });
        const signature = await stripeSignature(payload, "whsec_test_123");

        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-automatic-payout-event",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payout_events")).toContainEqual(
            expect.objectContaining({
                stripe_account_id: "platform",
                stripe_payout_id: "po_platform_automatic_1",
                status: "pending",
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });

    test("quarantines an automatic platform payout when payout protection has drifted", async () => {
        const harness = await createHarness();
        harness.rest.setPlatformPayoutInterval("manual");
        const payload = payoutEventPayload({
            eventId: "evt_platform_automatic_drift_1",
            payoutId: "po_platform_automatic_drift_1",
            automatic: true,
            method: "standard",
        });
        const signature = await stripeSignature(payload, "whsec_test_123");
        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-automatic-payout-drift",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "unexpected_provider_payout",
                severity: "critical",
                message: "Stripe reported an automatic platform payout while payout protection had drifted",
            }),
        );
    });

    test("quarantines a connected automatic payout during an emergency seller hold", async () => {
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
        harness.rest.seedEmergencySellerHold("seller-1", 250);
        const payload = payoutEventPayload({
            eventId: "evt_connected_automatic_hold_1",
            payoutId: "po_connected_automatic_hold_1",
            accountId: "acct_seller_example_com",
            automatic: true,
            method: "standard",
        });
        const signature = await stripeSignature(payload, "whsec_connect_test_456");
        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe-connect`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "connected-automatic-payout-emergency-hold",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "manual_review",
            financial_hold_reason: "Automatic payout conflicts with an emergency seller hold",
        });
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "unexpected_provider_payout",
                severity: "critical",
                message: "Stripe reported an automatic payout during an emergency seller hold",
            }),
        );
    });

    test("quarantines manual and instant platform payouts", async () => {
        const harness = await createHarness();
        const manualPayload = payoutEventPayload({
            eventId: "evt_platform_manual_1",
            payoutId: "po_platform_manual_1",
            automatic: false,
            method: "standard",
        });
        const instantPayload = payoutEventPayload({
            eventId: "evt_platform_instant_1",
            payoutId: "po_platform_instant_1",
            automatic: true,
            method: "instant",
        });
        for (const payload of [manualPayload, instantPayload]) {
            const signature = await stripeSignature(payload, "whsec_test_123");
            await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                    method: "POST",
                    headers: { "stripe-signature": signature },
                    body: payload,
                }),
            );
        }
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-unsafe-payout-events",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payout_events")).toHaveLength(2);
        expect(
            harness.rest
                .rows("provider_exceptions")
                .filter((row) => row.exception_type === "unexpected_provider_payout"),
        ).toHaveLength(2);
    });

    test("retrieves current provider truth when a payout event omits automatic", async () => {
        const harness = await createHarness();
        harness.rest.setProviderPayout({
            id: "po_platform_retrieved_1",
            amount: 1000,
            currency: "eur",
            status: "paid",
            automatic: true,
            method: "standard",
        });
        const payload = payoutEventPayload({
            eventId: "evt_platform_retrieved_1",
            payoutId: "po_platform_retrieved_1",
            method: "standard",
        });
        const signature = await stripeSignature(payload, "whsec_test_123");

        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-retrieved-payout-event",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payout_events")[0]).toMatchObject({
            stripe_payout_id: "po_platform_retrieved_1",
            status: "paid",
            provider_snapshot: { automatic: true, method: "standard" },
        });
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });

    test("fails closed when payout control mode remains ambiguous", async () => {
        const harness = await createHarness();
        const payload = payoutEventPayload({
            eventId: "evt_platform_ambiguous_1",
            payoutId: "po_platform_ambiguous_1",
            method: "standard",
        });
        const signature = await stripeSignature(payload, "whsec_test_123");

        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-ambiguous-payout-event",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "unexpected_provider_payout",
                severity: "critical",
                message: "Stripe payout control mode could not be verified",
            }),
        );

        const recoveredPayload = payoutEventPayload({
            eventId: "evt_platform_ambiguous_recovered_1",
            payoutId: "po_platform_ambiguous_1",
            eventType: "payout.paid",
            status: "paid",
            automatic: true,
            method: "standard",
        });
        const recoveredSignature = await stripeSignature(recoveredPayload, "whsec_test_123");
        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": recoveredSignature },
                body: recoveredPayload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-ambiguous-payout-recovered",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("provider_exceptions")[0]).toMatchObject({
            exception_type: "unexpected_provider_payout",
            status: "resolved",
            resolved_by: "provider-reconciliation",
        });
    });

    test("records an automatic failed platform payout as an operational exception", async () => {
        const harness = await createHarness();
        const payload = payoutEventPayload({
            eventId: "evt_platform_failed_1",
            payoutId: "po_platform_failed_1",
            eventType: "payout.failed",
            status: "failed",
            automatic: true,
            method: "standard",
        });
        const signature = await stripeSignature(payload, "whsec_test_123");

        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-failed-payout-event",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "provider_payout_failed",
                severity: "critical",
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).not.toContainEqual(
            expect.objectContaining({
                exception_type: "unexpected_provider_payout",
            }),
        );
    });

    test("records every connected payout state and quarantines manual and instant payouts", async () => {
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
        const manualPayload = payoutEventPayload({
            eventId: "evt_manual_payout_1",
            payoutId: "po_manual_1",
            accountId: "acct_seller_example_com",
            automatic: false,
            method: "standard",
        });
        const instantPayload = payoutEventPayload({
            eventId: "evt_instant_payout_1",
            payoutId: "po_instant_1",
            accountId: "acct_seller_example_com",
            automatic: true,
            method: "instant",
        });
        for (const payload of [manualPayload, instantPayload]) {
            const signature = await stripeSignature(payload, "whsec_connect_test_456");
            await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe-connect`, {
                    method: "POST",
                    headers: { "stripe-signature": signature },
                    body: payload,
                }),
            );
        }
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "connected-unsafe-payout-events",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payout_events")).toContainEqual(
            expect.objectContaining({
                stripe_payout_id: "po_manual_1",
                status: "pending",
            }),
        );
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "manual_review",
            financial_hold_reason: "Unexpected manual or instant Stripe payout",
        });
        expect(
            harness.rest
                .rows("provider_exceptions")
                .filter((row) => row.exception_type === "unexpected_provider_payout"),
        ).toHaveLength(2);
    });

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

    test("reconciles a succeeded PaymentIntent when its webhook was lost", async () => {
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
                clientReferenceId: "lost-payment-webhook-order",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        harness.rest.clearStripeRequests();

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "lost-payment-webhook-reconciliation",
                limit: 25,
            }),
        );
        const payments = reconciliation.payments as JsonRecord[];
        const operations = reconciliation.operations as JsonRecord[];
        expect(reconciliation.finishedAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(payments[0]?.paidAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(payments[0]?.lastProviderSyncAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(payments[1]?.paidAt).toBe(payments[0]?.paidAt);
        expect(payments[1]?.lastProviderSyncAt).toBe(payments[0]?.lastProviderSyncAt);
        expect(operations[0]?.claimedAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(operations[0]?.completedAt).toEqual(expect.stringMatching(isoTimestampPattern));
        const transferGroup = "cms_order_3335ee91cff910e16ec8360d9a159c7d08a409c9b7307cb706e78a7e1247f2c3";
        const expectedPayment = {
            paymentId: 1,
            providerPaymentId: 1,
            clientReferenceId: "lost-payment-webhook-order",
            financialTermsHash,
            financialRevision: 1,
            buyerUserId: "user-123",
            sellerUserId: "seller-1",
            stripePaymentIntentId: "pi_1",
            stripeChargeId: "ch_1",
            transferGroup,
            currency: "eur",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            platformRetainedAmount: 120,
            refundedAmount: 0,
            transferredAmount: 0,
            reversedAmount: 0,
            stripeChargeBalanceTransactionId: "txn_charge_1",
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
            manualReviewReason: null,
            description: null,
            paidAt: payments[0]?.paidAt,
            cancelledAt: null,
            lastProviderSyncAt: payments[0]?.lastProviderSyncAt,
            occurredAt: "2026-07-06T12:10:00.000Z",
            projectionAttemptCount: 1,
            causalSequence: 0,
            createdAt: "2026-07-06T12:05:00.000Z",
            updatedAt: "2026-07-06T12:10:00.000Z",
        };
        expect(reconciliation).toEqual({
            runId: 4,
            runKey: "lost-payment-webhook-reconciliation",
            status: "succeeded",
            scannedCount: 1,
            repairedCount: 1,
            exceptionCount: 0,
            details: {
                stripeApiVersion: "2026-02-25.clover",
                processedStripeEvents: 0,
                recoveredFinancialOperations: 0,
                reconciledStalePayments: 1,
                reconciledSellerRiskAccounts: 0,
                reconciledManualPayoutHolds: 0,
                platformPayoutInterval: "daily",
                platformPayoutMinimum: 0,
                platformRequiredMinimum: 0,
                workBudgetLimit: 25,
                workBudgetConsumed: 1,
            },
            finishedAt: reconciliation.finishedAt,
            payments: [
                {
                    ...expectedPayment,
                    providerEventId:
                        "payment:1:payment-intent-create:created:none:8ff5f26ecf043c8d4f737fc241bfd33465c18f801f18a0b233274e521c3f3129",
                    projectionId: 3,
                    projectionClaimToken: "claim-3-1",
                },
                {
                    ...expectedPayment,
                    providerEventId:
                        "payment:1:provider-sync:succeeded:ch_1:9d3a23058256c7334017e4d1d1c5679af6efbc0d7ffb6c1c536eb254a04d433b",
                    projectionId: 5,
                    projectionClaimToken: "claim-5-1",
                },
            ],
            operations: [
                {
                    providerOperationId: 2,
                    paymentId: 1,
                    providerPaymentId: 1,
                    clientReferenceId: "lost-payment-webhook-order",
                    businessKey: `payment:1:${financialTermsHash}`,
                    operationType: "payment_intent_create",
                    status: "succeeded",
                    amount: 1200,
                    currency: "eur",
                    releaseAuthorizationId: null,
                    refundRequestId: null,
                    commerceRefundRequestId: null,
                    stripeObjectId: "pi_1",
                    request: {
                        amount: 1200,
                        currency: "eur",
                        clientReferenceId: "lost-payment-webhook-order",
                        financialTermsHash,
                        transferGroup,
                    },
                    response: {
                        id: "pi_1",
                        status: "requires_payment_method",
                        amount: 1200,
                        amount_received: 0,
                        currency: "eur",
                        transfer_group: transferGroup,
                        metadata: {
                            cms_payment_id: "1",
                            client_reference_id: "lost-payment-webhook-order",
                            financial_terms_hash: financialTermsHash,
                            seller_cms_user_id: "seller-1",
                        },
                        latest_charge: null,
                    },
                    lastError: null,
                    attemptCount: 1,
                    nextAttemptAt: null,
                    claimedAt: operations[0]?.claimedAt,
                    completedAt: operations[0]?.completedAt,
                    providerEventId: "operation:2:succeeded",
                    occurredAt: "2026-07-06T12:10:00.000Z",
                    createdAt: "2026-07-06T12:04:00.000Z",
                    updatedAt: "2026-07-06T12:10:00.000Z",
                },
            ],
            commerceOperations: [],
            disputes: [],
        });
        expect(harness.rest.rows("payments")[0]).toMatchObject({
            stripe_charge_balance_transaction_id: "txn_charge_1",
            actual_stripe_charge_fee_amount: 65,
            actual_stripe_refund_fee_amount: 0,
            actual_stripe_processing_fee_amount: 65,
        });
        expect(harness.rest.stripeRequests).toEqual([
            {
                method: "GET",
                pathname: "/v1/balance_settings",
                searchParams: [],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "GET",
                pathname: "/v1/payment_intents/pi_1",
                searchParams: [["expand[]", "latest_charge.balance_transaction"]],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "GET",
                pathname: "/v1/disputes",
                searchParams: [
                    ["charge", "ch_1"],
                    ["limit", "100"],
                ],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "GET",
                pathname: "/v1/refunds",
                searchParams: [
                    ["charge", "ch_1"],
                    ["limit", "100"],
                ],
                idempotencyKey: null,
                stripeAccount: null,
            },
            {
                method: "GET",
                pathname: "/v1/transfers",
                searchParams: [
                    ["transfer_group", transferGroup],
                    ["limit", "100"],
                ],
                idempotencyKey: null,
                stripeAccount: null,
            },
        ]);
    });

    test("retrieves and validates Charge and BalanceTransaction references before accepting provider success", async () => {
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
                clientReferenceId: "provider-reference-hydration",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.setPaymentIntentProviderReferences(paymentIntentId);

        const synced = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(synced).toMatchObject({
            paymentStatus: "succeeded",
            commercePaymentStatus: "succeeded",
            settlementStatus: "held",
            stripeChargeId: "ch_1",
            stripeChargeBalanceTransactionId: "txn_charge_1",
            actualStripeChargeFeeAmount: 65,
        });
        expect(harness.rest.chargeRetrieveCount).toBe(1);
        expect(harness.rest.balanceTransactionRetrieveCount).toBe(1);
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });

    test("never trusts a separately retrieved BalanceTransaction without validating immutable payment truth", async () => {
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
                clientReferenceId: "invalid-retrieved-balance-transaction",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.setPaymentIntentProviderReferences(paymentIntentId);
        harness.rest.patchProviderBalanceTransaction(paymentIntentId, { amount: 1199, net: 1134 });

        const synced = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(synced).toMatchObject({
            paymentStatus: "failed",
            commercePaymentStatus: "manual_review",
            settlementStatus: "manual_review",
        });
        expect(harness.rest.balanceTransactionRetrieveCount).toBe(1);
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                payment_id: created.paymentId,
                exception_type: "provider_payment_truth_mismatch",
                status: "open",
            }),
        );
    });

    test("atomically clears only the transient expansion review after full provider revalidation", async () => {
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
                clientReferenceId: "transient-provider-review-recovery",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.setPaymentIntentProviderReferences(paymentIntentId);
        harness.rest.seedTransientProviderTruthReview(Number(created.paymentId), paymentIntentId);

        const first = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );
        const replay = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(first).toMatchObject({
            paymentStatus: "succeeded",
            commercePaymentStatus: "succeeded",
            settlementStatus: "held",
            manualReviewReason: null,
        });
        expect(replay).toMatchObject({ commercePaymentStatus: "succeeded", settlementStatus: "held" });
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                deduplication_key: `provider-payment-truth:${created.paymentId}:${paymentIntentId}`,
                status: "resolved",
                resolved_by: "provider-truth-revalidation",
            }),
        );
        expect(
            harness.rest
                .rows("payment_events")
                .filter((row) => row.event_type === "provider_payment_truth_revalidated"),
        ).toEqual([
            expect.objectContaining({
                payment_id: created.paymentId,
                actor_kind: "reconciliation",
                previous_settlement_status: "manual_review",
                next_settlement_status: "held",
            }),
        ]);
    });

    test("keeps transient provider review fail-closed when another unresolved exception exists", async () => {
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
                clientReferenceId: "transient-review-with-independent-risk",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.seedTransientProviderTruthReview(Number(created.paymentId), paymentIntentId);
        harness.rest.seedOtherOpenProviderException(Number(created.paymentId));

        const synced = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(synced).toMatchObject({
            paymentStatus: "succeeded",
            commercePaymentStatus: "manual_review",
            settlementStatus: "manual_review",
            reconciliationPending: true,
            manualReviewReason: "Stripe payment provider truth mismatch: charge_balance_transaction_expansion",
        });
        expect(
            harness.rest.rows("payment_events").some((row) => row.event_type === "provider_payment_truth_revalidated"),
        ).toBeFalse();
    });

    test("rebuilds a missing transient provider exception before recovering", async () => {
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
                clientReferenceId: "transient-review-without-recovery-exception",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.seedTransientProviderTruthReview(Number(created.paymentId), paymentIntentId);
        harness.rest.removeTransientProviderTruthException(Number(created.paymentId), paymentIntentId);

        const synced = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(synced).toMatchObject({
            paymentStatus: "succeeded",
            commercePaymentStatus: "succeeded",
            settlementStatus: "held",
            manualReviewReason: null,
        });
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                deduplication_key: `provider-payment-truth:${created.paymentId}:${paymentIntentId}`,
                status: "resolved",
                resolved_by: "provider-truth-revalidation",
            }),
        );
        expect(harness.rest.rows("payment_events")).toContainEqual(
            expect.objectContaining({
                payment_id: created.paymentId,
                event_type: "provider_payment_truth_revalidated",
            }),
        );
    });

    test("fails closed when Stripe succeeded payment truth diverges from immutable Commerce terms", async () => {
        const cases: Array<[string, (rest: StripeConnectMock, paymentIntentId: string) => void]> = [
            ["lower PaymentIntent amount", (rest, id) => rest.patchPaymentIntent(id, { amount: 1199 })],
            ["wrong PaymentIntent currency", (rest, id) => rest.patchPaymentIntent(id, { currency: "usd" })],
            [
                "wrong PaymentIntent transfer group",
                (rest, id) => rest.patchPaymentIntent(id, { transfer_group: "order:other" }),
            ],
            [
                "wrong immutable terms hash",
                (rest, id) => rest.patchPaymentIntentMetadata(id, { financial_terms_hash: "b".repeat(64) }),
            ],
            ["under-captured Charge", (rest, id) => rest.patchLatestCharge(id, { amount_captured: 1199 })],
            ["unpaid Charge", (rest, id) => rest.patchLatestCharge(id, { paid: false })],
            [
                "wrong Charge transfer group",
                (rest, id) => rest.patchLatestCharge(id, { transfer_group: "order:other" }),
            ],
        ];

        for (const [name, mutate] of cases) {
            const harness = await createHarness();
            await okJson(
                await sourceJson(
                    harness,
                    "createConnectOnboardingSessionForUser",
                    {
                        email: `seller-${name.replaceAll(" ", "-")}@example.com`,
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
                    clientReferenceId: `provider-truth-${name}`,
                    financialTermsHash,
                    dualApprovalThresholdAmount: 1000,
                }),
            );
            const paymentIntentId = String(created.stripePaymentIntentId);
            harness.rest.setPaymentIntentSucceeded(paymentIntentId);
            mutate(harness.rest, paymentIntentId);

            const synced = await okJson(
                await sourceRequest(harness, "getProtectedPayment", {
                    paymentId: String(created.paymentId),
                }),
            );

            expect(synced, name).toMatchObject({ paymentStatus: "failed", settlementStatus: "manual_review" });
            expect(harness.rest.rows("provider_exceptions"), name).toContainEqual(
                expect.objectContaining({
                    payment_id: created.paymentId,
                    exception_type: "provider_payment_truth_mismatch",
                    severity: "critical",
                    status: "open",
                }),
            );
            expect(harness.rest.rows("payment_events"), name).toContainEqual(
                expect.objectContaining({
                    payment_id: created.paymentId,
                    event_type: "provider_payment_truth_mismatch",
                    actor_kind: "reconciliation",
                }),
            );
        }
    });

    test("never lets charge.succeeded override a provider-truth quarantine", async () => {
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
                clientReferenceId: "charge-webhook-provider-truth",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.patchLatestCharge(paymentIntentId, { amount_captured: 1199 });
        const payload = JSON.stringify({
            id: "evt_charge_truth_mismatch",
            type: "charge.succeeded",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: "ch_1", payment_intent: paymentIntentId } },
        });
        const signature = await stripeSignature(payload, "whsec_test_123");
        const accepted = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        expect(accepted.status).toBe(202);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "charge-provider-truth-mismatch",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payments")[0]).toMatchObject({
            payment_status: "failed",
            settlement_status: "manual_review",
            stripe_charge_id: "ch_1",
        });
        expect(harness.rest.rows("payment_events")).toContainEqual(
            expect.objectContaining({
                event_type: "provider_payment_truth_mismatch",
                actor_kind: "webhook",
                actor_id: "evt_charge_truth_mismatch",
            }),
        );
    });

    test("tombstones an absent provider payment and permanently rejects a later create race", async () => {
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

        const first = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "cancel-before-provider-create",
                cancellationRequestId: "commerce-cancellation-absent-1",
                reason: "buyer cancelled before the provider payment existed",
            }),
        );
        const replay = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "cancel-before-provider-create",
                cancellationRequestId: "commerce-cancellation-absent-1",
                reason: "buyer cancelled before the provider payment existed",
            }),
        );
        const lateCreate = await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "cancel-before-provider-create",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        });

        expect(first).toMatchObject({
            cancellationRequestId: "commerce-cancellation-absent-1",
            providerStatus: "absent",
            providerPaymentAbsent: true,
            providerEventId: "payment-cancellation-absent:commerce-cancellation-absent-1",
        });
        expect(replay).toEqual(first);
        expect(lateCreate.status).toBe(409);
        expect(harness.rest.rows("payments")).toHaveLength(0);
        expect(harness.rest.rows("financial_operations")).toHaveLength(0);
        expect(harness.rest.rows("payment_lifecycle_guards")).toEqual([
            expect.objectContaining({
                client_reference_id: "cancel-before-provider-create",
                payment_id: null,
                cancellation_request_id: "commerce-cancellation-absent-1",
            }),
        ]);
    });

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

    test("keeps verification requirements visible when payouts were already enabled", async () => {
        const harness = await createHarness();

        await okJson(
            await sourceJson(harness, "createOnboardingSession", {
                email: "seller@example.com",
            }),
        );
        harness.rest.setStripeAccountState("user-123", {
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

        const status = await okJson(await sourceRequest(harness, "getConnectStatus"));

        expect(status).toMatchObject({
            payoutsEnabled: true,
            onboardingStatus: "requirements_due",
            currentlyDue: ["identity.individual.documents.primary_verification"],
        });
    });

    test("creates a hosted verification fallback for the authenticated seller", async () => {
        const harness = await createHarness();

        const link = await okJson(
            await sourceJson(harness, "createOnboardingLink", {
                email: "seller@example.com",
                returnUrl: "https://market.example/account/payouts",
                refreshUrl: "https://market.example/account/payouts",
            }),
        );

        expect(link).toMatchObject({
            userId: "user-123",
            onboardingStatus: "link_created",
            url: "https://connect.stripe.test/onboard",
        });
    });

    test("creates one immutable application-controlled recipient across onboarding replays", async () => {
        const harness = await createHarness();
        const request = { email: "seller@example.com", country: "FR" };

        await okJson(await sourceJson(harness, "createOnboardingSession", request));
        await okJson(await sourceJson(harness, "createOnboardingSession", request));

        expect(harness.rest.accountCreationRequests).toHaveLength(1);
        expect(harness.rest.accountCreationRequests[0]).toMatchObject({
            body: {
                dashboard: "none",
                defaults: {
                    responsibilities: {
                        fees_collector: "application",
                        losses_collector: "application",
                    },
                },
            },
            idempotencyKey: expect.stringMatching(/^cms_connect_account_v2_controlled_recipient_v2_/),
        });
    });

    test("replaces incomplete legacy v1 accounts before onboarding", async () => {
        const harness = await createHarness();

        harness.rest.seedLegacyRecipientAccount("user-123");
        const repaired = await okJson(
            await sourceJson(harness, "createOnboardingSession", {
                email: "seller@example.com",
            }),
        );

        expect(repaired.stripeAccountId).toBe("acct_seller_example_com");
        expect(repaired.stripeAccountApiVersion).toBe("v2");
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            stripe_account_id: "acct_seller_example_com",
            stripe_account_api_version: "v2",
        });
    });

    test("requires an email for new recipients and rejects unsafe legacy payout access", async () => {
        const fresh = await createHarness();
        const missingEmail = await sourceJson(fresh, "createOnboardingSession", {});

        expect(missingEmail.status).toBe(400);
        expect(await jsonBody(missingEmail)).toEqual({
            error: "email is required to create a Stripe recipient account",
        });

        const legacy = await createHarness();
        legacy.rest.seedActiveLegacyAccount("user-123");
        const session = await sourceJson(legacy, "createOnboardingSession", {});

        expect(session.status).toBe(409);
        expect(await jsonBody(session)).toEqual({
            error: "email is required to replace a recipient account with unsafe payout access",
        });
    });

    test("rejects a browser country override outside the pinned French recipient scope", async () => {
        const harness = await createHarness();

        const response = await sourceJson(harness, "createOnboardingSession", {
            email: "seller@example.com",
            country: "DE",
        });

        expect(response.status).toBe(400);
        expect(await jsonBody(response)).toEqual({
            error: "country must be FR for this integration version",
        });
        expect(harness.rest.rows("accounts")).toHaveLength(0);
    });

    test("enrolls a French seller without a bank account and keeps marketplace consent immutable and replayable", async () => {
        const harness = await createHarness();
        const version = "courtside-seller-2026-07";

        const missingConsent = await sourceJson(harness, "enrollConnectSeller", {
            accountToken: "accttok_test_identity_123",
            marketplaceTermsVersion: version,
            marketplaceTermsHash,
        });
        expect(missingConsent.status).toBe(409);
        expect(await jsonBody(missingConsent)).toEqual({ error: "current marketplace terms acceptance is required" });
        expect(harness.rest.rows("accounts")).toHaveLength(0);

        const enrolled = await okJson(
            await sourceJson(harness, "enrollConnectSeller", {
                accountToken: "accttok_test_identity_123",
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: version,
                marketplaceTermsHash,
            }),
        );
        expect(enrolled).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            stripeAccountApiVersion: "v2",
            accountStatus: "active",
            termsStatus: "accepted",
            stripeTermsStatus: "accepted",
            marketplaceTermsStatus: "accepted",
            marketplaceTermsCurrentVersionAccepted: true,
            enrollmentStatus: "enrolled",
            stripeTransfersStatus: "active",
            bankAccountStatus: "not_attached",
            bankPayoutsStatus: "unrequested",
            payoutsEnabled: false,
            canAcceptHeldPayments: true,
            canReceiveProtectedPayments: true,
            payoutBankReady: false,
        });
        expect(enrolled).not.toHaveProperty("commerceVerified");
        expect(harness.rest.rows("marketplace_terms_acceptances")).toEqual([
            {
                cms_user_id: "user-123",
                terms_version: version,
                terms_hash: marketplaceTermsHash,
                accepted_at: "2026-07-06T12:03:00.000Z",
            },
        ]);

        const replayed = await okJson(
            await sourceJson(harness, "enrollConnectSeller", {
                marketplaceTermsVersion: version,
                marketplaceTermsHash,
            }),
        );
        expect(replayed).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            marketplaceTermsCurrentVersionAccepted: true,
            enrollmentStatus: "enrolled",
        });
        expect(harness.rest.rows("marketplace_terms_acceptances")).toHaveLength(1);

        const currentStatus = await okJson(
            await sourceRequest(harness, "getConnectStatus", {
                marketplaceTermsVersion: version,
                marketplaceTermsHash,
            }),
        );
        const futureStatus = await okJson(
            await sourceRequest(harness, "getConnectStatus", {
                marketplaceTermsVersion: "courtside-seller-2026-08",
                marketplaceTermsHash: "d".repeat(64),
            }),
        );
        expect(currentStatus.marketplaceTermsCurrentVersionAccepted).toBeTrue();
        expect(futureStatus.marketplaceTermsCurrentVersionAccepted).toBeFalse();

        const unacceptedUpdate = await sourceJson(harness, "enrollConnectSeller", {
            marketplaceTermsVersion: "courtside-seller-2026-08",
            marketplaceTermsHash: "d".repeat(64),
        });
        expect(unacceptedUpdate.status).toBe(409);

        const acceptedUpdate = await okJson(
            await sourceJson(harness, "enrollConnectSeller", {
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: "courtside-seller-2026-08",
                marketplaceTermsHash: "d".repeat(64),
            }),
        );
        expect(acceptedUpdate).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            marketplaceTermsCurrentVersionAccepted: true,
            enrollmentStatus: "enrolled",
        });
        expect(harness.rest.rows("marketplace_terms_acceptances")).toHaveLength(2);

        const conflictingHash = await sourceJson(harness, "enrollConnectSeller", {
            marketplaceTermsAccepted: true,
            marketplaceTermsVersion: "courtside-seller-2026-08",
            marketplaceTermsHash: "e".repeat(64),
        });
        expect(conflictingHash.status).toBe(409);
        expect(await jsonBody(conflictingHash)).toEqual({
            error: "marketplace terms version is already bound to another document hash",
        });

        const bankReady = await okJson(
            await sourceJson(harness, "submitConnectVerification", {
                bankAccountToken: "btok_test_iban_123",
            }),
        );
        expect(bankReady).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            bankAccountStatus: "attached",
            bankPayoutsStatus: "active",
            payoutsEnabled: true,
            payoutBankReady: true,
        });
        expect(harness.rest.rows("accounts")).toHaveLength(1);
    });

    test("accepts a held charge before Stripe transfers or bank payouts are ready but keeps release strict", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJsonWithUser(harness, "seller-1", "enrollConnectSeller", {
                accountToken: "accttok_test_identity_123",
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: "courtside-seller-2026-07",
                marketplaceTermsHash,
            }),
        );
        harness.rest.setStripeAccountState("seller-1", {
            configuration: {
                recipient: {
                    applied: true,
                    capabilities: {
                        stripe_balance: {
                            stripe_transfers: { status: "pending", status_details: [] },
                            payouts: { status: "unrequested", status_details: [] },
                        },
                    },
                },
            },
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

        const status = await okJson(
            await sourceRequestWithUser(harness, "seller-1", "getConnectStatus", {
                marketplaceTermsVersion: "courtside-seller-2026-07",
                marketplaceTermsHash,
            }),
        );
        expect(status).toMatchObject({
            stripeTransfersStatus: "pending",
            bankAccountStatus: "not_attached",
            canAcceptHeldPayments: true,
            canReceiveProtectedPayments: false,
        });

        const payment = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "minimal-enrollment-held-charge",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        expect(payment).toMatchObject({ settlementStatus: "held", sellerUserId: "seller-1" });

        harness.rest.setPaymentIntentSucceeded(String(payment.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(payment.paymentId) }));
        const release = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: payment.paymentId,
            releaseAuthorizationId: "release-before-kyc",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        expect(release.status).toBe(409);
        expect(await jsonBody(release)).toEqual({ error: "seller financial risk blocks settlement release" });
    });

    test("accepts an optional contact email while Stripe identity stays inside the Account Token", async () => {
        const harness = await createHarness();

        const rejectedPii = await sourceJson(harness, "submitConnectVerification", {
            accountToken: "accttok_test_identity_123",
            bankAccountToken: "btok_test_iban_123",
            contactEmail: "seller@example.com",
            givenName: "Ada",
        });
        expect(rejectedPii.status).toBe(400);
        expect(await rejectedPii.text()).toBe("body.givenName is not allowed");

        const verified = await okJson(
            await sourceJson(harness, "submitConnectVerification", {
                accountToken: "accttok_test_identity_123",
                bankAccountToken: "btok_test_iban_123",
                contactEmail: "seller@example.com",
            }),
        );

        expect(verified).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            stripeAccountApiVersion: "v2",
            country: "FR",
            businessType: "individual",
            payoutsEnabled: true,
            onboardingStatus: "enabled",
        });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            cms_user_id: "user-123",
            stripe_account_id: "acct_custom_identity_123",
            stripe_account_api_version: "v2",
        });
    });

    test("replaces an incomplete Stripe-hosted v2 account with the custom French account", async () => {
        const harness = await createHarness();
        harness.rest.seedHostedV2AccountWithRequirements("user-123");

        const verified = await okJson(
            await sourceJson(harness, "submitConnectVerification", {
                accountToken: "accttok_test_identity_123",
                bankAccountToken: "btok_test_iban_123",
                contactEmail: "seller@example.com",
            }),
        );

        expect(verified.stripeAccountId).toBe("acct_custom_identity_123");
        expect(harness.rest.rows("accounts")[0]?.stripe_account_id).toBe("acct_custom_identity_123");
    });
});

async function createHarness() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("stripe-connect");
    if (!definition) {
        throw new Error("stripe-connect definition not found");
    }

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const importedBlocs: IntegrationBlocArtifact[] = [];
    const identities = new InMemoryIdentityService();
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "schema.sql", action: "applied" },
                    { type: "function", id: "cms-stripe-connect", action: "deployed" },
                ],
            };
        },
    };

    const result = await importIntegration(
        {
            sources,
            secrets,
            roles,
            dashboards,
            connectorDeployers: [deployer],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        {
            kind: "stripe-connect",
            answers: {
                id: "stripe-connect",
                stripeSecretKey: "sk_test_123",
                stripePublishableKey: "pk_test_123",
                stripeWebhookSecret: "whsec_test_123",
                stripeConnectWebhookSecret: "whsec_connect_test_456",
                stripeConnectV2WebhookSecret: "whsec_connect_v2_test_789",
                defaultCountry: "FR",
                defaultCurrency: "EUR",
                sellerActivityDescription: "Sale of second-hand goods between individuals.",
            },
            options: {},
        },
        [definition],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
    };

    const handler = await loadEdgeHandler();
    const rest = new StripeConnectMock();
    activeFetch = async (input, init) => rest.fetch(input, init);

    return {
        result,
        sources,
        secrets,
        roles,
        dashboards,
        importedBlocs,
        identities,
        deployment,
        rest,
        async edgeRequest(request: Request): Promise<Response> {
            return await handler(request);
        },
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-stripe-connect/`)) {
                    throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
                }
                return await handler(request);
            } catch (error) {
                return new Response(error instanceof Error ? (error.stack ?? error.message) : String(error), {
                    status: 599,
                });
            }
        },
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return (await secrets.get(key)) ?? undefined;
        },
    };
}

class StripeConnectMock {
    private readonly tables: Record<string, JsonRecord[]> = {
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
    private nextPaymentId = 1;
    private nextRowId = 1;
    private nextIntentId = 1;
    private nextTransferId = 1;
    private nextReversalId = 1;
    private nextRefundId = 1;
    private nextRefundStatus: "succeeded" | "pending" | "failed" = "succeeded";
    private nextRefundFee = 0;
    private failTransferReversals = false;
    private loseTransferReversalResponseAt: number | null = null;
    private inFlightTransferBeforeRefund: { paymentId: number; amount: number } | null = null;
    private failBalanceSettingsUpdates = false;
    private nextSellerBalanceSettingsPause: { entered: () => void; wait: Promise<void> } | null = null;
    private nextPlatformBalanceSettingsPause: { entered: () => void; wait: Promise<void> } | null = null;
    private loseNextPlatformBalanceSettingsResponse = false;
    private loseNextSellerBalanceSettingsResponse = false;
    private omitMinimumBalanceOnNextUpdate = false;
    private addSellerRiskDuringNextAutomaticRestore = false;
    private loseNextPaymentCancellationResponse = false;
    private returnNextPaymentCancellationNonTerminal = false;
    private failPaymentProjectionEnqueue = false;
    private failProviderExceptionResolution = false;
    private failPaymentReconciliationLedgerRead = false;
    private failPaymentReconciliationLocalContextRead = false;
    private failAccountReloadAfterTermsAcceptance = false;
    private omitNextAccountRead = false;
    private providerTransferContextReadsBeforeFailure: number | null = null;
    private failProviderTransferList = false;
    private losePaymentProjectionEnqueueResponse = false;
    private failPaymentIntentRetrieve = false;
    private paymentIntentReplacementOnNextRetrieve: { paymentId: number; replacementId: string } | null = null;
    private readonly paymentIntents = new Map<string, JsonRecord>();
    private readonly providerCharges = new Map<string, JsonRecord>();
    private readonly providerBalanceTransactions = new Map<string, JsonRecord>();
    private readonly providerTransfers: JsonRecord[] = [];
    private readonly providerTransferReversals = new Map<string, JsonRecord[]>();
    private readonly providerRefunds: JsonRecord[] = [];
    private readonly providerDisputes: JsonRecord[] = [];
    private readonly providerPayouts = new Map<string, JsonRecord>();
    private availableEur = 4500;
    private readonly stripeAccountState = new Map<string, JsonRecord>();
    private readonly customAccountIds = new Set<string>();
    lastPaymentIntentParameters: URLSearchParams | null = null;
    lastTransferParameters: Record<string, string> | null = null;
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
    readonly postgrestRequests: PostgrestRequestRecord[] = [];
    readonly stripeRequests: StripeRequestRecord[] = [];
    paymentIntentCreateCount = 0;
    chargeRetrieveCount = 0;
    balanceTransactionRetrieveCount = 0;
    balanceSettingsUpdateCount = 0;
    private balanceSettings: JsonRecord = {
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
    private platformBalanceSettings: JsonRecord = {
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

    rejectTransferReversals(): void {
        this.failTransferReversals = true;
    }

    loseTransferReversalResponseAfter(successfulUpcomingReversals: number): void {
        this.loseTransferReversalResponseAt = this.nextReversalId + successfulUpcomingReversals;
    }

    patchPaymentLedger(paymentId: number, patch: JsonRecord): void {
        const payment = this.tables.payments.find((row) => same(row.id, paymentId));
        if (!payment) {
            throw new Error(`unknown payment ${paymentId}`);
        }
        this.update(payment, patch);
    }

    replacePaymentIntentDuringNextRetrieve(paymentId: number, replacementId: string): void {
        this.paymentIntentReplacementOnNextRetrieve = { paymentId, replacementId };
    }

    failNextPaymentProjectionEnqueue(): void {
        this.failPaymentProjectionEnqueue = true;
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
            return await this.stripeFetch(request, url, method);
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
            let guard = this.tables.payment_lifecycle_guards.find((row) => row.client_reference_id === reference);
            if (guard?.cancellation_request_id) {
                return jsonResponse(
                    { message: "conflict: protected payment creation was cancelled before provider creation" },
                    400,
                );
            }
            const existing = this.tables.payments.find((row) => row.client_reference_id === reference);
            const reserved = existing ?? this.insertPayment(payment);
            if (!guard) {
                guard = this.insertGeneric("payment_lifecycle_guards", {
                    client_reference_id: reference,
                    payment_id: reserved.id,
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
            return jsonResponse(reserved);
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
        if (table === "rpc/reserve_financial_operation" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            const businessKey = String(body.p_business_key);
            const existing = this.tables.financial_operations.find((row) => row.business_key === businessKey);
            if (existing) {
                return jsonResponse(existing);
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
            this.tables.financial_operations.push(operation);
            return jsonResponse(operation);
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
                return jsonResponse({ message: "Stripe Connect account not found" }, 400);
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
        if (table === "rpc/authorize_irreversible_dispute_action" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            if (body.p_actor_kind !== "admin") {
                return jsonResponse({ message: "forbidden: admin approval actor is required" }, 400);
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
                    threshold_amount: body.p_threshold_amount,
                    payload_sha256: body.p_payload_sha256,
                    status: "pending_second_approval",
                    first_actor_kind: body.p_actor_kind,
                    first_actor_id: body.p_actor_id,
                    second_actor_kind: null,
                    second_actor_id: null,
                });
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
            if (table === "accounts" && this.omitNextAccountRead) {
                this.omitNextAccountRead = false;
                return jsonResponse([]);
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

    private async stripeFetch(request: Request, url: URL, method: string): Promise<Response> {
        expect(request.headers.get("authorization")).toBe("Bearer sk_test_123");
        if (url.pathname.startsWith("/v1/")) {
            expect(request.headers.get("stripe-version")).toBe("2026-02-25.clover");
        }
        if (url.pathname.startsWith("/v2/")) {
            expect(request.headers.get("stripe-version")).toBe("2026-06-24.dahlia");
            expect(request.headers.get("content-type")).toBe("application/json");
        }
        this.stripeRequests.push({
            method,
            pathname: url.pathname,
            searchParams: Array.from(url.searchParams.entries()),
            idempotencyKey: request.headers.get("idempotency-key"),
            stripeAccount: request.headers.get("stripe-account"),
        });
        if (url.pathname === "/v2/core/accounts" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            if ("account_token" in body) {
                expect(body).toMatchObject({
                    account_token: "accttok_test_identity_123",
                    dashboard: "none",
                    identity: { country: "fr" },
                    defaults: {
                        currency: "eur",
                        profile: { product_description: "Sale of second-hand goods between individuals." },
                        responsibilities: {
                            fees_collector: "application",
                            losses_collector: "application",
                        },
                    },
                    configuration: {
                        recipient: {
                            capabilities: {
                                stripe_balance: { stripe_transfers: { requested: true } },
                            },
                        },
                    },
                    include: ["configuration.recipient", "defaults", "identity", "requirements"],
                    metadata: { cms_user_id: expect.any(String) },
                });
                expect(body).not.toHaveProperty("contact_email");
                expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_custom_recipient_v2_");
                const accountId = "acct_custom_identity_123";
                this.customAccountIds.add(accountId);
                return jsonResponse(stripeAccountV2(accountId, "seller@example.com", true));
            }
            const email = String(body.contact_email ?? "unknown@example.com");
            expect(body).toMatchObject({
                dashboard: "none",
                identity: { country: "fr", entity_type: "individual" },
                defaults: {
                    currency: "eur",
                    profile: { product_description: "Sale of second-hand goods between individuals." },
                    responsibilities: {
                        fees_collector: "application",
                        losses_collector: "application",
                    },
                },
                configuration: {
                    recipient: {
                        capabilities: {
                            stripe_balance: { stripe_transfers: { requested: true } },
                        },
                    },
                },
            });
            expect(request.headers.get("idempotency-key")).toStartWith(
                "cms_connect_account_v2_controlled_recipient_v2_",
            );
            expect(JSON.stringify(body)).not.toContain("requirements_collector");
            this.accountCreationRequests.push({
                body,
                idempotencyKey: request.headers.get("idempotency-key"),
            });
            const accountId = `acct_${email.replace(/[^a-z0-9]+/gi, "_")}`;
            return jsonResponse(stripeAccountV2(accountId, email));
        }
        if (url.pathname.startsWith("/v2/core/accounts/") && method === "POST") {
            const accountId = decodeURIComponent(url.pathname.slice("/v2/core/accounts/".length));
            const body = JSON.parse(await request.text()) as JsonRecord;
            if ("account_token" in body) {
                expect(String(body.account_token)).toStartWith("accttok_");
                expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_custom_identity_");
                this.accountUpdateRequests.push({
                    accountId,
                    body,
                    idempotencyKey: request.headers.get("idempotency-key"),
                });
                this.customAccountIds.add(accountId);
                return jsonResponse(stripeAccountV2(accountId, "seller@example.com", true));
            }
            expect(body).toMatchObject({
                dashboard: "none",
                defaults: {
                    currency: "eur",
                    profile: { product_description: "Sale of second-hand goods between individuals." },
                    responsibilities: {
                        fees_collector: "application",
                        losses_collector: "application",
                    },
                },
                configuration: {
                    recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
                },
                include: ["configuration.recipient", "defaults", "identity", "requirements"],
            });
            expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_custom_controlled_recipient_v2_");
            expect(JSON.stringify(body)).not.toContain("requirements_collector");
            return jsonResponse(stripeAccountV2(accountId, "seller@example.com", true));
        }
        if (url.pathname.startsWith("/v2/core/accounts/") && method === "GET") {
            expect(url.searchParams.has("include[]")).toBe(false);
            expect(Array.from(url.searchParams.entries())).toEqual([
                ["include[0]", "configuration.recipient"],
                ["include[1]", "defaults"],
                ["include[2]", "identity"],
                ["include[3]", "requirements"],
            ]);
            const accountId = decodeURIComponent(url.pathname.slice("/v2/core/accounts/".length));
            const row = this.tables.accounts.find((account) => account.stripe_account_id === accountId);
            const userId = String(row?.cms_user_id ?? "unknown");
            return jsonResponse({
                ...stripeAccountV2(accountId, `${userId}@example.com`, this.customAccountIds.has(accountId)),
                ...this.stripeAccountState.get(userId),
            });
        }
        if (url.pathname === "/v2/core/account_links" && method === "POST") {
            const body = JSON.parse(await request.text()) as JsonRecord;
            this.accountLinkRequests.push(body);
            expect(body).toMatchObject({
                account: expect.stringContaining("acct_"),
                use_case: {
                    type: "account_onboarding",
                    account_onboarding: {
                        configurations: ["recipient"],
                        collection_options: { fields: "currently_due", future_requirements: "omit" },
                        return_url: "https://market.example/account/payouts",
                        refresh_url: "https://market.example/account/payouts",
                    },
                },
            });
            return jsonResponse({
                object: "v2.core.account_link",
                url: "https://connect.stripe.test/onboard",
                expires_at: "2027-01-15T08:00:00.000Z",
            });
        }
        if (url.pathname.startsWith("/v1/accounts/") && method === "GET") {
            const accountId = decodeURIComponent(url.pathname.slice("/v1/accounts/".length));
            const row = this.tables.accounts.find((account) => account.stripe_account_id === accountId);
            const userId = String(row?.cms_user_id ?? "unknown");
            return jsonResponse({
                ...stripeAccountV1(userId, accountId),
                ...this.stripeAccountState.get(userId),
            });
        }
        if (url.pathname === "/v1/balance" && method === "GET") {
            expect(request.headers.get("stripe-account")).toBe("acct_seller_example_com");
            return jsonResponse({
                object: "balance",
                available: [{ amount: this.availableEur, currency: "eur" }],
                pending: [
                    { amount: 1800, currency: "eur" },
                    { amount: 125, currency: "usd" },
                ],
                instant_available: [{ amount: 1000, currency: "eur" }],
                connect_reserved: [{ amount: 200, currency: "eur" }],
                livemode: false,
            });
        }
        if (url.pathname === "/v1/balance_settings" && method === "GET") {
            return jsonResponse(
                request.headers.get("stripe-account") ? this.balanceSettings : this.platformBalanceSettings,
            );
        }
        if (url.pathname === "/v1/balance_settings" && method === "POST") {
            const connectedAccount = request.headers.get("stripe-account");
            expect(request.headers.get("idempotency-key")).toStartWith(
                connectedAccount ? "cms:payout-schedule:" : "cms:platform-payout-protection:",
            );
            const params = new URLSearchParams(await request.text());
            this.balanceSettingsUpdateCount++;
            if (connectedAccount && this.failBalanceSettingsUpdates) {
                return jsonResponse({ error: { message: "balance settings unavailable" } }, 503);
            }
            if (connectedAccount && this.nextSellerBalanceSettingsPause) {
                const pause = this.nextSellerBalanceSettingsPause;
                this.nextSellerBalanceSettingsPause = null;
                pause.entered();
                await pause.wait;
            }
            if (!connectedAccount && this.nextPlatformBalanceSettingsPause) {
                const pause = this.nextPlatformBalanceSettingsPause;
                this.nextPlatformBalanceSettingsPause = null;
                pause.entered();
                await pause.wait;
            }
            const target = connectedAccount ? this.balanceSettings : this.platformBalanceSettings;
            const payments = target.payments as JsonRecord;
            const payouts = payments.payouts as JsonRecord;
            const settlement = payments.settlement_timing as JsonRecord;
            payouts.schedule = {
                interval: params.get("payments[payouts][schedule][interval]"),
                weekly_payout_days: params.getAll("payments[payouts][schedule][weekly_payout_days][]"),
                monthly_payout_days: params.getAll("payments[payouts][schedule][monthly_payout_days][]").map(Number),
            };
            const requestedMinimum = params.get("payments[payouts][minimum_balance_by_currency][eur]");
            if (requestedMinimum !== null) {
                const omitMinimum = this.omitMinimumBalanceOnNextUpdate || Number(requestedMinimum) === 0;
                this.omitMinimumBalanceOnNextUpdate = false;
                payouts.minimum_balance_by_currency = omitMinimum ? {} : { eur: Number(requestedMinimum) };
            }
            settlement.delay_days_override = Number(params.get("payments[settlement_timing][delay_days_override]"));
            payments.debit_negative_balances = params.get("payments[debit_negative_balances]") === "true";
            if (
                connectedAccount &&
                params.get("payments[payouts][schedule][interval]") === "daily" &&
                this.addSellerRiskDuringNextAutomaticRestore
            ) {
                this.addSellerRiskDuringNextAutomaticRestore = false;
                const account = this.tables.accounts.find((row) => row.stripe_account_id === connectedAccount);
                if (account) {
                    this.update(account, {
                        financial_exposure_amount: 250,
                        risk_revision: Number(account.risk_revision ?? 0) + 1,
                        risk_status: "restricted",
                        financial_hold_reason: "Seller recovery exposure blocks payments and payouts",
                    });
                }
            }
            if (connectedAccount && this.loseNextSellerBalanceSettingsResponse) {
                this.loseNextSellerBalanceSettingsResponse = false;
                return jsonResponse({ error: { message: "connection closed after Stripe committed the update" } }, 503);
            }
            if (!connectedAccount && this.loseNextPlatformBalanceSettingsResponse) {
                this.loseNextPlatformBalanceSettingsResponse = false;
                return jsonResponse({ error: { message: "connection closed after Stripe committed the update" } }, 503);
            }
            return jsonResponse(target);
        }
        if (/^\/v1\/payouts\/po_[^/]+$/.test(url.pathname) && method === "GET") {
            const payoutId = decodeURIComponent(url.pathname.slice("/v1/payouts/".length));
            const payout = this.providerPayouts.get(payoutId);
            return payout ? jsonResponse(payout) : jsonResponse({ error: { message: "payout not found" } }, 404);
        }
        if (url.pathname === "/v1/payouts" && method === "POST") {
            expect(request.headers.get("stripe-account")).toBe("acct_seller_example_com");
            expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_payout_");
            const params = new URLSearchParams(await request.text());
            expect(params.get("amount")).toBe(String(this.availableEur));
            expect(params.get("currency")).toBe("eur");
            expect(params.get("method")).toBe("standard");
            const amount = this.availableEur;
            this.availableEur = 0;
            return jsonResponse({
                id: "po_test_1",
                amount,
                currency: "eur",
                status: "pending",
                arrival_date: 1800000000,
            });
        }
        if (/^\/v1\/accounts\/[^/]+\/external_accounts$/.test(url.pathname) && method === "POST") {
            const params = new URLSearchParams(await request.text());
            expect(params.get("external_account")).toBe("btok_test_iban_123");
            expect(params.get("default_for_currency")).toBe("true");
            expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_bank_");
            const accountId = decodeURIComponent(url.pathname.split("/")[3] ?? "");
            const row = this.tables.accounts.find((account) => account.stripe_account_id === accountId);
            const userId = String(row?.cms_user_id ?? "unknown");
            this.stripeAccountState.set(userId, {
                configuration: {
                    recipient: {
                        applied: true,
                        capabilities: {
                            stripe_balance: {
                                stripe_transfers: { status: "active", status_details: [] },
                                payouts: { status: "active", status_details: [] },
                            },
                        },
                    },
                },
            });
            return jsonResponse({
                id: "ba_test_123",
                object: "bank_account",
                country: "FR",
                currency: "eur",
                last4: "0123",
            });
        }
        if (url.pathname === "/v1/account_sessions" && method === "POST") {
            const params = new URLSearchParams(await request.text());
            expect(Array.from(params.entries())).toEqual([
                ["account", expect.stringContaining("acct_")],
                ["components[account_onboarding][enabled]", "true"],
            ]);
            const accountId = params.get("account") || "acct_unknown";
            const row = this.tables.accounts.find((account) => account.stripe_account_id === accountId);
            return jsonResponse({
                account: accountId,
                client_secret: `as_${row?.cms_user_id ?? "unknown"}_secret`,
                expires_at: 1800000000,
            });
        }
        if (url.pathname === "/v1/account_links" && method === "POST") {
            const params = new URLSearchParams(await request.text());
            expect(params.get("account")).toStartWith("acct_");
            expect(params.get("type")).toBe("account_onboarding");
            expect(params.get("return_url")).toBe("https://market.example/account/payouts");
            expect(params.get("refresh_url")).toBe("https://market.example/account/payouts");
            return jsonResponse({
                url: "https://connect.stripe.test/onboard",
                expires_at: 1800000000,
            });
        }
        if (url.pathname === "/v1/files" && method === "POST") {
            expect(request.headers.get("content-type")).toStartWith("multipart/form-data; boundary=");
            const upload = this.fileUploadRequests.at(-1);
            if (!upload) {
                throw new Error("Stripe file upload form data was not captured");
            }
            return jsonResponse({ id: "file_dispute_1", filename: upload.fileName, purpose: upload.purpose });
        }
        if (url.pathname === "/v1/payment_intents" && method === "POST") {
            const params = new URLSearchParams(await request.text());
            this.paymentIntentCreateCount += 1;
            this.lastPaymentIntentParameters = params;
            expect(params.getAll("payment_method_types[]")).toEqual(["card"]);
            expect(params.has("automatic_payment_methods[enabled]")).toBeFalse();
            expect(params.has("transfer_data[destination]")).toBeFalse();
            expect(params.has("application_fee_amount")).toBeFalse();
            expect(params.has("on_behalf_of")).toBeFalse();
            expect(params.get("metadata[financial_terms_hash]")).toBe(financialTermsHash);
            expect(params.getAll("expand[]")).toEqual(["latest_charge.balance_transaction"]);
            const id = `pi_${this.nextIntentId++}`;
            const intent = {
                id,
                client_secret: `${id}_secret`,
                status: "requires_payment_method",
                amount: Number(params.get("amount")),
                amount_received: 0,
                currency: params.get("currency"),
                transfer_group: params.get("transfer_group"),
                metadata: {
                    cms_payment_id: params.get("metadata[cms_payment_id]"),
                    client_reference_id: params.get("metadata[client_reference_id]"),
                    financial_terms_hash: params.get("metadata[financial_terms_hash]"),
                    seller_cms_user_id: params.get("metadata[seller_cms_user_id]"),
                },
                latest_charge: null,
            };
            this.paymentIntents.set(id, intent);
            return jsonResponse(intent);
        }
        if (/^\/v1\/payment_intents\/pi_[^/]+\/cancel$/.test(url.pathname) && method === "POST") {
            const id = decodeURIComponent(url.pathname.slice("/v1/payment_intents/".length, -"/cancel".length));
            const params = new URLSearchParams(await request.text());
            expect(params.get("cancellation_reason")).toBe("requested_by_customer");
            expect(params.getAll("expand[]")).toEqual(["latest_charge.balance_transaction"]);
            expect(request.headers.get("idempotency-key")).toStartWith("cms:payment-cancel:");
            const intent = this.paymentIntents.get(id);
            if (!intent) {
                return jsonResponse({ error: { message: "PaymentIntent not found" } }, 404);
            }
            if (this.returnNextPaymentCancellationNonTerminal) {
                this.returnNextPaymentCancellationNonTerminal = false;
                return jsonResponse(intent);
            }
            Object.assign(intent, { status: "canceled", canceled_at: Math.floor(Date.now() / 1000) });
            if (this.loseNextPaymentCancellationResponse) {
                this.loseNextPaymentCancellationResponse = false;
                throw new Error("simulated lost PaymentIntent cancellation response");
            }
            return jsonResponse(intent);
        }
        if (url.pathname.startsWith("/v1/payment_intents/") && method === "GET") {
            const id = decodeURIComponent(url.pathname.slice("/v1/payment_intents/".length));
            if (this.failPaymentIntentRetrieve) {
                this.failPaymentIntentRetrieve = false;
                return jsonResponse({ error: { message: "simulated Stripe provider outage" } }, 503);
            }
            const intent = this.paymentIntents.get(id) ?? {
                id,
                status: "requires_payment_method",
                latest_charge: null,
            };
            const replacement = this.paymentIntentReplacementOnNextRetrieve;
            if (replacement) {
                this.paymentIntentReplacementOnNextRetrieve = null;
                this.patchPaymentLedger(replacement.paymentId, {
                    stripe_payment_intent_id: replacement.replacementId,
                });
            }
            return jsonResponse(intent);
        }
        if (/^\/v1\/charges\/ch_[^/]+$/.test(url.pathname) && method === "GET") {
            const id = decodeURIComponent(url.pathname.slice("/v1/charges/".length));
            this.chargeRetrieveCount += 1;
            expect(url.searchParams.getAll("expand[]")).toEqual(["balance_transaction"]);
            const charge = this.providerCharges.get(id);
            return charge ? jsonResponse(charge) : jsonResponse({ error: { message: "Charge not found" } }, 404);
        }
        if (/^\/v1\/balance_transactions\/txn_[^/]+$/.test(url.pathname) && method === "GET") {
            const id = decodeURIComponent(url.pathname.slice("/v1/balance_transactions/".length));
            this.balanceTransactionRetrieveCount += 1;
            const transaction = this.providerBalanceTransactions.get(id);
            return transaction
                ? jsonResponse(transaction)
                : jsonResponse({ error: { message: "BalanceTransaction not found" } }, 404);
        }
        if (url.pathname === "/v1/disputes" && method === "GET") {
            const charge = url.searchParams.get("charge");
            return jsonResponse({
                data: this.providerDisputes.filter((dispute) => !charge || dispute.charge === charge),
                has_more: false,
            });
        }
        if (/^\/v1\/disputes\/dp_[^/]+$/.test(url.pathname) && method === "GET") {
            const disputeId = decodeURIComponent(url.pathname.slice("/v1/disputes/".length));
            const dispute = this.providerDisputes.find((candidate) => candidate.id === disputeId);
            return dispute ? jsonResponse(dispute) : jsonResponse({ error: { message: "dispute not found" } }, 404);
        }
        if (/^\/v1\/disputes\/dp_[^/]+$/.test(url.pathname) && method === "POST") {
            const disputeId = decodeURIComponent(url.pathname.slice("/v1/disputes/".length));
            return jsonResponse({ id: disputeId, status: "under_review", evidence_details: { submission_count: 1 } });
        }
        if (/^\/v1\/disputes\/dp_[^/]+\/close$/.test(url.pathname) && method === "POST") {
            const disputeId = decodeURIComponent(url.pathname.slice("/v1/disputes/".length, -"/close".length));
            return jsonResponse({ id: disputeId, status: "lost" });
        }
        if (url.pathname === "/v1/transfers" && method === "GET") {
            if (this.failProviderTransferList) {
                this.failProviderTransferList = false;
                return jsonResponse({ error: { message: "simulated Stripe Transfer list outage" } }, 503);
            }
            const transferGroup = url.searchParams.get("transfer_group");
            return jsonResponse({
                data: this.providerTransfers.filter(
                    (transfer) => !transferGroup || transfer.transfer_group === transferGroup,
                ),
                has_more: false,
            });
        }
        if (url.pathname === "/v1/transfers" && method === "POST") {
            const params = new URLSearchParams(await request.text());
            this.moneyCallOrder.push("transfer");
            this.lastTransferParameters = Object.fromEntries(params.entries());
            const id = `tr_${this.nextTransferId++}`;
            const transfer = {
                id,
                amount: Number(params.get("amount")),
                currency: params.get("currency"),
                destination: params.get("destination"),
                source_transaction: params.get("source_transaction"),
                transfer_group: params.get("transfer_group"),
                metadata: {
                    cms_payment_id: params.get("metadata[cms_payment_id]"),
                    cms_release_authorization_id: params.get("metadata[cms_release_authorization_id]"),
                    cms_release_kind: params.get("metadata[cms_release_kind]"),
                },
                amount_reversed: 0,
                reversed: false,
            };
            this.providerTransfers.push(transfer);
            return jsonResponse(transfer);
        }
        if (/^\/v1\/transfers\/tr_[^/]+\/reversals$/.test(url.pathname) && method === "GET") {
            const transferId = decodeURIComponent(url.pathname.slice("/v1/transfers/".length, -"/reversals".length));
            return jsonResponse({ data: this.providerTransferReversals.get(transferId) ?? [], has_more: false });
        }
        if (/^\/v1\/transfers\/tr_[^/]+\/reversals\/trr_[^/]+$/.test(url.pathname) && method === "GET") {
            const path = url.pathname.slice("/v1/transfers/".length).split("/reversals/");
            const transferId = decodeURIComponent(path[0] ?? "");
            const reversalId = decodeURIComponent(path[1] ?? "");
            const reversal = (this.providerTransferReversals.get(transferId) ?? []).find(
                (candidate) => candidate.id === reversalId,
            );
            return reversal ? jsonResponse(reversal) : jsonResponse({ error: { message: "reversal not found" } }, 404);
        }
        if (/^\/v1\/transfers\/tr_[^/]+\/reversals$/.test(url.pathname) && method === "POST") {
            const params = new URLSearchParams(await request.text());
            this.moneyCallOrder.push("reversal");
            if (this.failTransferReversals) {
                return new Response(
                    JSON.stringify({ error: { message: "connected account balance is unavailable" } }),
                    {
                        status: 402,
                        headers: { "content-type": "application/json" },
                    },
                );
            }
            const transferId = decodeURIComponent(url.pathname.slice("/v1/transfers/".length, -"/reversals".length));
            const transfer = this.providerTransfers.find((candidate) => candidate.id === transferId);
            const reversalAmount = Number(params.get("amount"));
            if (transfer) {
                transfer.amount_reversed = Number(transfer.amount_reversed ?? 0) + reversalAmount;
                transfer.reversed = Number(transfer.amount_reversed) >= Number(transfer.amount);
            }
            const reversal = {
                id: `trr_${this.nextReversalId++}`,
                amount: reversalAmount,
                currency: "eur",
                metadata: { operation_key: params.get("metadata[operation_key]") },
            };
            const providerReversals = this.providerTransferReversals.get(transferId) ?? [];
            providerReversals.push(reversal);
            this.providerTransferReversals.set(transferId, providerReversals);
            if (Number(reversal.id.slice("trr_".length)) === this.loseTransferReversalResponseAt) {
                this.loseTransferReversalResponseAt = null;
                throw new Error("simulated network loss after Stripe created the reversal");
            }
            return jsonResponse(reversal);
        }
        if (/^\/v1\/refunds\/re_[^/]+$/.test(url.pathname) && method === "GET") {
            const refundId = decodeURIComponent(url.pathname.slice("/v1/refunds/".length));
            const refund = this.providerRefunds.find((candidate) => candidate.id === refundId);
            return refund ? jsonResponse(refund) : jsonResponse({ error: { message: "refund not found" } }, 404);
        }
        if (url.pathname === "/v1/refunds" && method === "GET") {
            const charge = url.searchParams.get("charge");
            return jsonResponse({
                data: this.providerRefunds.filter((refund) => !charge || refund.charge === charge),
                has_more: false,
            });
        }
        if (url.pathname === "/v1/refunds" && method === "POST") {
            const params = new URLSearchParams(await request.text());
            this.moneyCallOrder.push("refund");
            const refundId = `re_${this.nextRefundId++}`;
            const refundFee = this.nextRefundFee;
            const refund = {
                id: refundId,
                charge: params.get("charge"),
                amount: Number(params.get("amount")),
                currency: "eur",
                status: this.nextRefundStatus,
                ...(this.nextRefundStatus === "succeeded"
                    ? {
                          balance_transaction: {
                              id: `txn_refund_${refundId.slice(3)}`,
                              amount: -Number(params.get("amount")),
                              fee: refundFee,
                              net: -Number(params.get("amount")) - refundFee,
                              currency: "eur",
                              fee_details:
                                  refundFee === 0 ? [] : [{ type: "stripe_fee", amount: refundFee, currency: "eur" }],
                          },
                      }
                    : {}),
                ...(this.nextRefundStatus === "failed" ? { failure_reason: "provider_declined" } : {}),
            };
            this.nextRefundStatus = "succeeded";
            this.nextRefundFee = 0;
            this.providerRefunds.push(refund);
            return jsonResponse(refund);
        }
        throw new Error(`unexpected Stripe fetch: ${method} ${url}`);
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

    private applyPaymentProviderProjection(body: JsonRecord): Response {
        const payment = this.tables.payments.find((row) => same(row.id, body.p_payment_id));
        if (!payment) {
            return jsonResponse({ message: "not_found: payment" }, 400);
        }
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
                      stripe_balance_transaction_id: null,
                      actual_stripe_fee_amount: 0,
                      actual_stripe_net_amount: null,
                      actual_stripe_fee_currency: null,
                      actual_stripe_fee_details: [],
                  }
                : {};
        const row = { id: this.nextRowId++, created_at: now, updated_at: now, ...defaults, ...value };
        this.tables[table].push(row);
        return { ...row };
    }

    private update(row: JsonRecord, patch: JsonRecord): JsonRecord {
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

function stripeAccountV1(userId: string, accountId: string): JsonRecord {
    return {
        id: accountId,
        country: "FR",
        business_type: "individual",
        charges_enabled: false,
        payouts_enabled: true,
        details_submitted: true,
        capabilities: { transfers: "active" },
        requirements: {
            currently_due: [],
            eventually_due: [],
            past_due: [],
            pending_verification: [],
            errors: [],
        },
        future_requirements: {},
        tos_acceptance: { service_agreement: "full" },
        metadata: { cms_user_id: userId },
    };
}

function stripeAccountV2(accountId: string, email: string, custom = false): JsonRecord {
    return {
        id: accountId,
        object: "v2.core.account",
        applied_configurations: ["recipient"],
        contact_email: email,
        display_name: email.split("@")[0],
        dashboard: "none",
        identity: {
            country: "FR",
            entity_type: "individual",
            attestations: {
                terms_of_service: { account: { shown_and_accepted: true } },
            },
        },
        defaults: {
            currency: "eur",
            responsibilities: {
                fees_collector: "application",
                losses_collector: "application",
                requirements_collector: "application",
            },
        },
        configuration: {
            recipient: {
                applied: true,
                capabilities: {
                    stripe_balance: {
                        stripe_transfers: { status: "active", status_details: [] },
                        payouts: { status: custom ? "unrequested" : "active", status_details: [] },
                    },
                },
            },
        },
        requirements: { entries: [], summary: null },
        future_requirements: { entries: [], summary: null },
        closed: false,
    };
}

function defaultAccountRow(userId: string, now: string): JsonRecord {
    return {
        cms_user_id: userId,
        stripe_account_id: null,
        stripe_account_api_version: "v1",
        application_controlled_recipient: false,
        terms_accepted: false,
        provider_account_closed: false,
        external_bank_account_attached: false,
        marketplace_terms_version: "legacy-test-fixture",
        marketplace_terms_hash: "b".repeat(64),
        marketplace_terms_accepted_at: now,
        country: "FR",
        business_type: null,
        onboarding_status: "not_started",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        disabled_reason: null,
        capabilities: {},
        requirements_currently_due: [],
        requirements_eventually_due: [],
        requirements_past_due: [],
        requirements_pending_verification: [],
        requirements_errors: [],
        future_requirements: {},
        payout_schedule: "stripe_default",
        risk_status: "standard",
        financial_hold_reason: null,
        outstanding_debt_amount: 0,
        financial_exposure_amount: 0,
        risk_revision: 0,
        provider_hold_minimum_amount: 0,
        payout_hold_claimed_by: null,
        payout_hold_claimed_at: null,
        payout_blocked_at: null,
        manual_payout_hold_started_at: null,
        manual_payout_hold_alert_at: null,
        manual_payout_hold_deadline_at: null,
        manual_payout_hold_restore_settings: null,
        last_onboarding_started_at: null,
        last_provider_sync_at: null,
        created_at: now,
        updated_at: now,
    };
}

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) {
        await import(edgeFunctionUrl);
    }
    if (!edgeHandler) {
        throw new Error("cms-stripe-connect edge handler was not registered");
    }
    return edgeHandler;
}

async function sourceRequest(
    harness: Harness,
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    return await sourceRequestWithUser(harness, "user-123", endpoint, params);
}

async function sourceRequestWithUser(
    harness: Harness,
    userId: string,
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    return await sourceRequestWithRole(harness, userId, "admin", endpoint, params);
}

async function sourceRequestWithRole(
    harness: Harness,
    userId: string,
    role: string | undefined,
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}stripe-connect/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await proxySource(harness, userId, role, new Request(url));
}

async function sourceJson(
    harness: Harness,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    return await sourceJsonWithUser(harness, "user-123", endpoint, body, params);
}

async function sourceJsonWithUser(
    harness: Harness,
    userId: string,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    return await sourceJsonWithRole(harness, userId, "admin", endpoint, body, params);
}

async function sourceJsonWithRole(
    harness: Harness,
    userId: string,
    role: string | undefined,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}stripe-connect/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await proxySource(
        harness,
        userId,
        role,
        new Request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

async function proxySource(
    harness: Harness,
    userId: string,
    role: string | undefined,
    request: Request,
): Promise<Response> {
    return await handleSourceRequest(harness.sources, request, {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: userId, ...(role ? { userRole: role } : {}) }),
            identities: harness.identities,
        },
    });
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

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

function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    return input instanceof Request ? input : new Request(input, init);
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function filterValue(value: string | null): { operator: string; value: string } | null {
    if (!value) {
        return null;
    }
    const [operator, ...rest] = value.split(".");
    return { operator: operator ?? "", value: rest.join(".") };
}

function same(a: unknown, b: unknown): boolean {
    return String(a) === String(b);
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

async function jsonBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

function payoutEventPayload(options: {
    eventId: string;
    payoutId: string;
    accountId?: string;
    eventType?: string;
    status?: string;
    automatic?: boolean;
    method: "standard" | "instant";
}): string {
    return JSON.stringify({
        id: options.eventId,
        type: options.eventType ?? "payout.created",
        ...(options.accountId ? { account: options.accountId } : {}),
        api_version: "2026-02-25.clover",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: {
            object: {
                id: options.payoutId,
                amount: 1000,
                currency: "eur",
                status: options.status ?? "pending",
                ...(options.automatic === undefined ? {} : { automatic: options.automatic }),
                method: options.method,
            },
        },
    });
}

async function stripeSignature(payload: string, secret: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
    const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `t=${timestamp},v1=${hex}`;
}

async function okJson(response: Response): Promise<JsonRecord> {
    const body = await jsonBody(response);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    return body;
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
        rest: harness.rest,
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
        edgeRequest: async (request: Request) => await harness.edgeRequest(request),
        providerRequestCount: () => harness.rest.stripeRequests.length,
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
registerAccountProviderBoundaryContracts(createProviderBoundaryHarness);
registerDisputeFileProviderBoundaryContracts(createProviderBoundaryHarness);
registerAccountTermsRepositoryContracts(createRepositoryBoundaryHarness);
registerLedgerRepositoryContracts(createRepositoryBoundaryHarness);
registerPaymentOperationRepositoryContracts(createRepositoryBoundaryHarness);
registerPaymentProjectionContracts(createPaymentProjectionHarness);
registerPaymentProjectionFailureContracts(createPaymentProjectionHarness);
registerPaymentProjectionReplayContracts(createPaymentProjectionHarness);
registerPaymentCancellationReplayContracts(createPaymentCancellationHarness);
registerPaymentCancellationRecoveryContracts(createPaymentCancellationHarness);
registerPaymentCancellationFailureContracts(createPaymentCancellationHarness);
registerProviderReconciliationContracts(createProviderReconciliationHarness);
registerProviderReconciliationBudgets(createProviderReconciliationHarness);
registerProviderExceptionResolutionContracts(createProviderReconciliationHarness);
registerPaymentReconciliationLedgerContracts(createProviderReconciliationHarness);
registerPaymentReconciliationLedgerDivergenceContracts(createProviderReconciliationHarness);
registerStalePaymentLocalContextContracts(createProviderReconciliationHarness);
registerStalePaymentLocalContextFailureContracts(createProviderReconciliationHarness);
registerProviderTransferContextContracts(createProviderReconciliationHarness);
registerProviderTransferContextFailureContracts(createProviderReconciliationHarness);
registerTerminalOperationRecoveryContracts(createProviderReconciliationHarness);
registerStripeConnectRoutingContracts(createRoutingHarness);
registerAccountOnboardingContracts(createAccountHandlerHarness);
registerAccountEnrollmentContracts(createAccountHandlerHarness);
registerAccountLifecycleContracts(createAccountHandlerHarness);
