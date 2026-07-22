import { afterAll, describe, expect, test } from "bun:test";
import { USER_ROLE } from "@bernouy/cms-permissions";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { registerAccountSourceScenarios } from "./stripe-connect/accounts/source-scenarios/register";
import { registerSellerPayoutSourceScenarios } from "./stripe-connect/accounts/source-scenarios/payout-schedule/register";
import { registerFinancialOperationRedactionScenario } from "./stripe-connect/dashboard/financial-operation-redaction.contracts";
import { registerPaymentCancellationSourceScenarios } from "./stripe-connect/payments/cancellation/source-scenarios";
import { registerDisputeApprovalSourceScenarios } from "./stripe-connect/provider-boundary/dispute-approval/source-scenarios";
import { registerPlatformProtectionSourceScenarios } from "./stripe-connect/provider-boundary/protected-payment/platform-protection/source-scenarios/register";
import { registerDisputeRecoverySourceScenarios } from "./stripe-connect/provider-reconciliation/payment-ledger/source-scenarios/disputes/register";
import { registerPaymentRecoverySourceScenarios } from "./stripe-connect/provider-reconciliation/payment-ledger/source-scenarios/register";
import { registerProtectedRefundSourceScenarios } from "./stripe-connect/provider-boundary/protected-refund/success/source-scenarios/register";
import { registerPayoutSourceScenarios } from "./stripe-connect/routing/webhooks/payout-scenarios/register";
import {
    registerWebhookRecoverySourceScenario,
    registerWebhookSourceScenarios,
} from "./stripe-connect/routing/webhooks/source-scenarios/register";
import { registerStripeConnectBoundaryContracts } from "./stripe-connect/routing/registrations/register";
import { registerRootSourceScenarios } from "./stripe-connect/routing/registrations/source-scenarios/register";
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
import {
    createStripeConnectHarness as createHarness,
    type StripeConnectHarness as Harness,
} from "./stripe-connect/runtime/harness";
import { jsonBody, okJson, stripeSignature } from "./stripe-connect/runtime/http";
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
    registerRootSourceScenarios(createHarness);

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

    registerPlatformProtectionSourceScenarios(createHarness);

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

registerStripeConnectBoundaryContracts(createHarness);
