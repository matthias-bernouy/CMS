import { describe, expect, test } from "bun:test";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { InMemoryDashboardRepository, validateDashboard } from "@bernouy/cms-dashboards";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationBlocArtifact,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { executeFunction, InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository, USER_ROLE } from "@bernouy/cms-permissions";
import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type DataShape,
    type Source,
} from "@bernouy/cms-sources";
import { InMemoryTriggerRepository, validateTrigger } from "@bernouy/cms-triggers";

const SELLER_TERMS_VERSION = "seller-terms-2026-07-13";
const SELLER_TERMS_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("commerce-stripe-payments 1.0.0", () => {
    test("imports and creates a payment from trusted order data with the canonical CMS seller identity", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        const roles = new InMemoryRolesRepository();
        const triggers = new InMemoryTriggerRepository();
        const dashboards = new InMemoryDashboardRepository();
        const importedBlocs: IntegrationBlocArtifact[] = [];
        await sources.createSource(commerceSource());
        await sources.createSource(stripeSource());
        await seedInstallation(installations, "commerce");
        await seedInstallation(installations, "stripe-connect");

        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT)
            .get("commerce-stripe-payments");
        if (!definition) throw new Error("commerce-stripe-payments definition not found");
        expect(JSON.stringify(definition.artifacts?.filter(artifact => artifact.type === "function")))
            .not.toContain("debitNegativeBalances");
        const result = await importIntegration(
            {
                sources,
                functions,
                installations,
                roles,
                triggers,
                dashboards,
                blocs: {
                    async importBloc(artifact) {
                        importedBlocs.push(artifact);
                        return { id: artifact.tag, action: "created" };
                    },
                },
            },
            {
                kind: "commerce-stripe-payments",
                answers: {
                    sellerTermsVersion: SELLER_TERMS_VERSION,
                    sellerTermsHash: SELLER_TERMS_HASH,
                },
                options: {},
            },
            [definition],
        );
        const fn = await functions.getFunction("createPaymentForOrder");
        const configFn = await functions.getFunction("getStripePaymentClientConfig");
        const statusFn = await functions.getFunction("getPaymentForOrder");
        const refreshFn = await functions.getFunction("refreshPaymentForOrder");
        const releaseFn = await functions.getFunction("executeAuthorizedSettlementRelease");
        const refundFn = await functions.getFunction("executeAuthorizedRefund");
        const cancellationFn = await functions.getFunction("executeProviderPaymentCancellation");
        const deadlineWorker = await functions.getFunction("processDueOrderDeadlines");
        const cancellationWorker = await functions.getFunction("dispatchPendingPaymentCancellations");
        const releaseWorker = await functions.getFunction("dispatchDueProtectedSettlements");
        const refundWorker = await functions.getFunction("dispatchPendingProtectedRefunds");
        const reconciliationWorker = await functions.getFunction("reconcileProtectedPaymentSystems");
        const enrollmentFn = await functions.getFunction("getSellerSaleEnrollment");
        const platformDecreaseFn = await functions.getFunction("applyPlatformPayoutLiabilityDecrease");
        const submitPriceFn = await functions.getFunction("submitSellerOfferPrice");
        const protectedOrderFn = await functions.getFunction("createProtectedOrder");
        if (!fn) throw new Error("createPaymentForOrder function not imported");
        if (!configFn) throw new Error("getStripePaymentClientConfig function not imported");
        if (!statusFn) throw new Error("getPaymentForOrder function not imported");
        if (!refreshFn) throw new Error("refreshPaymentForOrder function not imported");
        if (!releaseFn) throw new Error("executeAuthorizedSettlementRelease function not imported");
        if (!refundFn || !cancellationFn || !deadlineWorker || !cancellationWorker || !releaseWorker || !refundWorker || !reconciliationWorker) throw new Error("protected financial workers not imported");
        if (!enrollmentFn || !platformDecreaseFn || !submitPriceFn || !protectedOrderFn) throw new Error("seller sale enrollment functions not imported");
        expect(fn.access).toEqual({ mode: "auth" });
        expect((await sources.getEndpoint(makeEndpointUrn("commerce", "prepareProtectedPayment")))?.access)
            .toEqual({ mode: "system" });
        expect(result.artifacts).toEqual([
            { type: "function", id: enrollmentFn.id, action: "created" },
            { type: "function", id: platformDecreaseFn.id, action: "created" },
            { type: "function", id: submitPriceFn.id, action: "created" },
            { type: "function", id: protectedOrderFn.id, action: "created" },
            { type: "function", id: "getStripePaymentClientConfig", action: "created" },
            { type: "function", id: fn.id, action: "created" },
            { type: "function", id: statusFn.id, action: "created" },
            { type: "function", id: refundFn.id, action: "created" },
            { type: "function", id: releaseFn.id, action: "created" },
            { type: "function", id: cancellationFn.id, action: "created" },
            { type: "function", id: refreshFn.id, action: "created" },
            { type: "function", id: deadlineWorker.id, action: "created" },
            { type: "function", id: cancellationWorker.id, action: "created" },
            { type: "function", id: releaseWorker.id, action: "created" },
            { type: "function", id: refundWorker.id, action: "created" },
            { type: "function", id: reconciliationWorker.id, action: "created" },
            { type: "trigger", id: "execute-authorized-settlement-release", action: "created" },
            { type: "trigger", id: "execute-requested-order-refund", action: "created" },
            { type: "trigger", id: "execute-reviewed-order-refund", action: "created" },
            { type: "trigger", id: "execute-claim-resolution-refund", action: "created" },
            { type: "trigger", id: "execute-buyer-cancellation-refund", action: "created" },
            { type: "trigger", id: "execute-seller-cancellation-refund", action: "created" },
            { type: "trigger", id: "execute-reviewed-cancellation-refund", action: "created" },
            { type: "trigger", id: "execute-buyer-payment-cancellation", action: "created" },
            { type: "trigger", id: "execute-seller-payment-cancellation", action: "created" },
            { type: "trigger", id: "execute-reviewed-payment-cancellation", action: "created" },
            { type: "dashboard", id: "commerce-stripe-payments-operations", action: "created" },
            { type: "bloc", id: "commerce-stripe-payment", action: "created" },
        ]);
        expect(await validateFunction(fn, { sources })).toEqual([]);
        expect(await validateFunction(configFn, { sources })).toEqual([]);
        expect(await validateFunction(statusFn, { sources })).toEqual([]);
        expect(await validateFunction(refreshFn, { sources })).toEqual([]);
        expect(await validateFunction(releaseFn, { sources })).toEqual([]);
        expect(await validateFunction(refundFn, { sources })).toEqual([]);
        expect(await validateFunction(cancellationFn, { sources })).toEqual([]);
        expect(JSON.stringify(refundFn)).toContain('"max":24');
        expect(await validateFunction(releaseWorker, { sources })).toEqual([]);
        expect(await validateFunction(refundWorker, { sources })).toEqual([]);
        expect(await validateFunction(cancellationWorker, { sources })).toEqual([]);
        expect(await validateFunction(reconciliationWorker, { sources })).toEqual([]);
        const operationsDashboard = await dashboards.getDashboard("commerce-stripe-payments-operations");
        expect(operationsDashboard).not.toBeNull();
        expect(validateDashboard(operationsDashboard!, { source: (await sources.getSource("urn:commerce"))! })).toEqual([]);
        const operationsDashboardJSON = JSON.stringify(operationsDashboard);
        expect(operationsDashboardJSON).toContain("providerPaymentsTable");
        expect(operationsDashboardJSON).toContain("providerFinancialOperationsTable");
        expect(operationsDashboardJSON).toContain("actualStripeProcessingFeeAmount");
        expect(operationsDashboardJSON).toContain("actualPlatformMarginAfterStripeAmount");
        expect(operationsDashboardJSON).toContain("dualApprovalRequired");
        expect(operationsDashboardJSON).toContain("firstApprovedBy");
        expect(operationsDashboardJSON).toContain("downloadClaimEvidence");
        const dashboardTabs = (operationsDashboard as any)?.views?.[0]?.tabs ?? [];
        const claimsTab = dashboardTabs.find((tab: any) => tab.id === "claims");
        const paymentsTab = dashboardTabs.find((tab: any) => tab.id === "payments");
        const refundsTab = dashboardTabs.find((tab: any) => tab.id === "refunds");
        const disputesTab = dashboardTabs.find((tab: any) => tab.id === "stripeDisputes");
        expect(claimsTab?.children?.map((child: any) => child.id)).toEqual(expect.arrayContaining([
            "claimsTable", "claimDetail", "claimEvidenceTable", "claimEvidenceDetail",
        ]));
        expect(paymentsTab?.children?.map((child: any) => child.id)).not.toContain("claimEvidenceTable");

        const sectionFieldPaths = (detail: any, sectionId: string) =>
            detail?.main?.find((section: any) => section.id === sectionId)?.fields?.map((field: any) => field.path) ?? [];
        const protectedPaymentDetail = paymentsTab?.children?.find((child: any) => child.id === "protectedPaymentDetail");
        expect(protectedPaymentDetail?.main?.map((section: any) => section.id)).toEqual(expect.arrayContaining([
            "immutableFinancialSnapshot", "settlementLedgerSnapshot", "protectedPaymentTimelines",
        ]));
        expect(sectionFieldPaths(protectedPaymentDetail, "immutableFinancialSnapshot")).toEqual(expect.arrayContaining([
            "financialTerms.shippingAmount",
            "financialTerms.estimatedStripeCostAmount",
            "financialTerms.estimatedCarrierCostAmount",
            "financialTerms.expectedPlatformMarginAmount",
            "financialTerms.feePolicySnapshot",
            "financialTerms.protectionPolicySnapshot",
            "financialTerms.sellerRiskPolicySnapshot",
            "financialTerms",
        ]));
        expect(sectionFieldPaths(protectedPaymentDetail, "settlementLedgerSnapshot")).toEqual(expect.arrayContaining([
            "settlement.totalTransferredAmount",
            "settlement.totalReversedAmount",
            "settlement.totalRefundedAmount",
            "settlement.sellerReserveLiabilityRemainingAmount",
            "settlement",
        ]));
        expect(sectionFieldPaths(protectedPaymentDetail, "protectedPaymentTimelines")).toEqual(expect.arrayContaining([
            "paymentAttempts", "fulfillment", "claims", "refundRequests", "stripeDisputes", "auditEvents",
        ]));
        expect(protectedPaymentDetail?.main?.find((section: any) => section.id === "immutableFinancialSnapshot")?.description)
            .toContain("policy estimates, not provider expenses");

        const refundRequestDetail = refundsTab?.children?.find((child: any) => child.id === "refundRequestDetail");
        expect(refundRequestDetail?.main?.map((section: any) => section.id)).toEqual(expect.arrayContaining([
            "stripeBuyerRefundFacts", "sellerTransferRecoveryFacts",
        ]));
        expect(sectionFieldPaths(refundRequestDetail, "stripeBuyerRefundFacts")).toEqual(expect.arrayContaining([
            "providerSnapshot.id",
            "providerSnapshot.status",
            "providerSnapshot.balanceTransaction.id",
            "providerSnapshot.balanceTransaction.amount",
            "providerSnapshot.balanceTransaction.fee",
            "providerSnapshot.balanceTransaction.net",
            "providerSnapshot",
        ]));
        expect(sectionFieldPaths(refundRequestDetail, "sellerTransferRecoveryFacts")).toEqual(expect.arrayContaining([
            "sellerRecoveryAmount", "sellerReserveOffsetAmount", "businessKey", "claimId",
        ]));
        expect(sectionFieldPaths(refundRequestDetail, "refundState")).not.toContain("sellerRecoveryAmount");

        const stripeDisputeDetail = disputesTab?.children?.find((child: any) => child.id === "stripeDisputeDetail");
        expect(sectionFieldPaths(stripeDisputeDetail, "disputeProviderBalanceImpact")).toEqual(expect.arrayContaining([
            "fundsWithdrawn",
            "balanceTransactionIds",
            "stripeChargeId",
            "providerPaymentId",
            "clientReferenceId",
        ]));
        const stripeDisputesTable = disputesTab?.children?.find((child: any) => child.id === "stripeDisputesTable");
        expect(stripeDisputesTable?.columns?.map((column: any) => column.path)).toContain("fundsWithdrawn");
        expect(operationsDashboardJSON).not.toContain("manualPayment");
        expect(operationsDashboardJSON).not.toContain("sellerList");
        expect(validateTrigger((await triggers.getTrigger("execute-authorized-settlement-release"))!)).toEqual([]);
        for (const triggerId of [
            "execute-requested-order-refund",
            "execute-reviewed-order-refund",
            "execute-claim-resolution-refund",
            "execute-buyer-cancellation-refund",
            "execute-seller-cancellation-refund",
            "execute-reviewed-cancellation-refund",
            "execute-buyer-payment-cancellation",
            "execute-seller-payment-cancellation",
            "execute-reviewed-payment-cancellation",
        ]) {
            expect(validateTrigger((await triggers.getTrigger(triggerId))!)).toEqual([]);
        }
        expect(await validateFunction(enrollmentFn, { sources })).toEqual([]);
        expect(await validateFunction(submitPriceFn, { sources })).toEqual([]);
        expect(await validateFunction(protectedOrderFn, { sources })).toEqual([]);
        expect((await roles.get(USER_ROLE))?.grants.map(grant => grant.permission)).toEqual(expect.arrayContaining([
            "urn:system-functions:createPaymentForOrder",
            "urn:system-functions:getStripePaymentClientConfig",
            "urn:system-functions:getPaymentForOrder",
            "urn:system-functions:refreshPaymentForOrder",
            "urn:system-functions:getSellerSaleEnrollment",
            "urn:system-functions:submitSellerOfferPrice",
            "urn:system-functions:createProtectedOrder",
        ]));
        expect(importedBlocs[0]?.viewJS).toContain("confirmPayment");
        expect(importedBlocs[0]?.viewJS).toContain("createPaymentForOrder");
        expect(importedBlocs[0]?.viewJS).toContain("refreshPaymentForOrder");
        expect(importedBlocs[0]?.viewJS).toContain("refreshPaymentUntilSettled");
        expect(importedBlocs[0]?.viewJS).toContain("PAYMENT_RECONCILIATION_POLL_TIMEOUT_MS = 60_000");
        expect(importedBlocs[0]?.viewJS).toContain("payment?.reconciliationPending === true");
        expect(importedBlocs[0]?.viewJS).not.toContain("manualReviewReason");
        expect(importedBlocs[0]?.viewJS).not.toContain("charge_balance_transaction_expansion");
        expect(importedBlocs[0]?.viewJS).toContain('!["blocked", "reversed"].includes(settlement)');
        expect(importedBlocs[0]?.viewJS).toContain("this.paymentSubmissionLocked = true");
        expect(importedBlocs[0]?.viewJS).toContain("this.paymentSubmissionLocked || !currentFormIsUsable");
        const transientReconciliationBranch = importedBlocs[0]?.viewJS.indexOf("if (payment?.reconciliationPending === true") ?? -1;
        const manualReviewBranch = importedBlocs[0]?.viewJS.indexOf('if (settlement === "manual_review")') ?? -1;
        const disputeBranch = importedBlocs[0]?.viewJS.indexOf('if (["open", "under_review", "lost"].includes(dispute))') ?? -1;
        expect(disputeBranch).toBeGreaterThanOrEqual(0);
        expect(transientReconciliationBranch).toBeGreaterThan(disputeBranch);
        expect(manualReviewBranch).toBeGreaterThan(transientReconciliationBranch);
        expect(importedBlocs[0]?.viewJS).toContain("SELLER_PROTECTED_PAYMENT_NOT_READY");
        expect(importedBlocs[0]?.viewJS).toContain("Cette annonce n’est pas disponible à l’achat pour le moment");
        expect(importedBlocs[0]?.viewJS).toContain("protectedPaymentState");
        expect(importedBlocs[0]?.viewJS).toContain("payment?.settlementStatus");
        expect(importedBlocs[0]?.viewJS).toContain("payment?.disputeStatus");
        expect(importedBlocs[0]?.viewJS).toContain("payment?.refundedAmount");
        expect(importedBlocs[0]?.viewJS).not.toContain('paymentIntent?.status === "succeeded"');
        expect(importedBlocs[0]?.viewJS).toContain("paymentElementReady");
        expect(importedBlocs[0]?.viewJS).toContain('element.on("ready"');
        expect(importedBlocs[0]?.viewJS).toContain('element.on("loaderror"');
        expect(importedBlocs[0]?.viewJS).toContain("waitUntilVisible");
        expect(importedBlocs[0]?.viewJS).toContain("stableFrames >= 2");
        expect(importedBlocs[0]?.viewJS).toContain('wallets: { link: this.linkWallet() }');
        expect(importedBlocs[0]?.viewJS).toContain('this.getAttribute("link-wallet") === "auto" ? "auto" : "never"');
        expect(atob(importedBlocs[0]?.source?.["default.html"] ?? "")).toContain('link-wallet="never"');
        expect(importedBlocs[0]?.viewJS).not.toContain("if (isVisible(element)) return Promise.resolve()");
        expect(importedBlocs[0]?.viewJS).toContain('mount.slot = PAYMENT_ELEMENT_SLOT');
        expect(importedBlocs[0]?.viewJS).toContain('<slot name="stripe-payment-element"></slot>');
        expect(importedBlocs[0]?.viewJS).toContain('slot[name="stripe-payment-element"]');
        expect(importedBlocs[0]?.viewJS).toContain("min-width: 0;");
        expect(importedBlocs[0]?.viewJS).not.toContain('<div data-payment-element></div>');
        expect(importedBlocs[0]?.viewJS).toContain("--primary-base");
        expect(importedBlocs[0]?.viewJS).not.toContain("seller-user-id");
        expect(importedBlocs[0]?.viewJS).not.toContain("amount-total");
        expect(importedBlocs[0]?.viewJS).not.toContain("application-fee-amount");
        expect(importedBlocs[0]?.viewJS).toContain('this.dispatch("refund"');
        expect(importedBlocs[0]?.viewJS).toContain('this.dispatch("blocked"');
        expect(importedBlocs[0]?.viewJS).not.toContain("🔒");
        expect(importedBlocs[0]?.viewJS).toContain("<svg");
        expect(importedBlocs[0]?.editorJS).toContain('type: "color"');

        const identities = new InMemoryIdentityService();
        let paymentBody: unknown;
        let recordPaymentBody: unknown;
        let platformPayoutBody: unknown;
        let sellerPayoutBody: unknown;
        const response = await executeFunction(fn, new Request("https://cms.test/functions/createPaymentForOrder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId: 42 }),
        }), {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/protected-payment/seller-context")) {
                        expect(await request.json()).toEqual({ orderId: 42 });
                        expect(request.headers.get("x-cms-user-id")).toBe("buyer-subject");
                        return Response.json({
                            sellerCmsUserId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        expect(await request.json()).toEqual({
                            sellerUserId: "seller-subject",
                            marketplaceTermsVersion: SELLER_TERMS_VERSION,
                            marketplaceTermsHash: SELLER_TERMS_HASH,
                        });
                        return Response.json({ eligible: true, reasonCode: "eligible" });
                    }
                    if (request.url.startsWith("https://commerce.test/payment/prepare")) {
                        expect(await request.json()).toEqual({ orderId: 42 });
                        return Response.json({
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            orderNumber: "ORDER-42",
                            sellerId: "seller-subject",
                            buyerTotalAmount: 2500,
                            sellerProceedsAmount: 2250,
                            sellerTransferReleaseAmount: 2050,
                            sellerReserveLiabilityAmount: 200,
                            currency: "EUR",
                            financialTermsHash: "terms_hash_42",
                            financialRevision: 3,
                            protectionRequired: true,
                            payoutDelayDays: 14,
                            dualApprovalThresholdAmount: 1000,
                            sellerRequiredMinimumBalanceAmount: 0,
                            platformRequiredMinimumBalanceAmount: 2250,
                            platformLiabilityRevision: 7,
                            platformPayoutDecreaseAuthorizationId: null,
                            platformPayoutChangeDirection: "increase",
                            sellerReserveLiabilityDays: 30,
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/payment/record")) {
                        recordPaymentBody = await request.json();
                        return Response.json({ paymentStatus: "requires_action", settlementStatus: "held" });
                    }
                    if (request.url.startsWith("https://stripe.test/payout/platform")) {
                        platformPayoutBody = await request.json();
                        return Response.json({
                            liabilityRevision: 7,
                            appliedMinimumBalanceEur: 2250,
                            decreaseAuthorizationId: null,
                            payoutControl: { interval: "manual" },
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/recordPlatformPayoutLiabilityApplied")) {
                        return Response.json({ accepted: true, needsReapply: false });
                    }
                    if (request.url.startsWith("https://stripe.test/payout/seller")) {
                        throw new Error("seller payout controls must not block checkout");
                    }
                    paymentBody = await request.json();
                    expect(request.headers.get("x-user-id")).toBe("buyer-subject");
                    return Response.json({
                        paymentId: 9,
                        stripePaymentIntentId: "pi_9",
                        clientSecret: "pi_9_secret_test",
                                clientReferenceId: "order-public-42",
                                paymentStatus: "requires_action",
                                commercePaymentStatus: "requires_action",
                                settlementStatus: "held",
                                disputeStatus: "none",
                                refundedAmount: 0,
                                transferredAmount: 0,
                                reversedAmount: 0,
                                sellerTransferAmount: 2250,
                                platformRetainedAmount: 250,
                        amountTotal: 2500,
                        currency: "EUR",
                        financialTermsHash: "terms_hash_42",
                        updatedAt: "2026-07-13T00:00:00.000Z",
                    });
                },
            },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            paymentId: 9,
            stripePaymentIntentId: "pi_9",
            status: "requires_action",
            paymentStatus: "requires_action",
            commercePaymentStatus: "requires_action",
            settlementStatus: "held",
            disputeStatus: "none",
            refundedAmount: 0,
            clientSecret: "pi_9_secret_test",
            amountTotal: 2500,
            buyerTotalAmount: 2500,
            currency: "EUR",
            financialTermsHash: "terms_hash_42",
        });
        expect(paymentBody).toEqual({
            sellerUserId: "seller-subject",
            amountTotal: 2500,
            sellerTransferAmount: 2250,
            currency: "EUR",
            clientReferenceId: "order-public-42",
            financialTermsHash: "terms_hash_42",
            financialRevision: 3,
            dualApprovalThresholdAmount: 1000,
            description: "ORDER-42",
        });
        expect(platformPayoutBody).toEqual({
            platformPayoutControlChangeId: "commerce-payment:terms_hash_42",
            minimumBalanceEur: 2250,
            liabilityRevision: 7,
            decreaseAuthorizationId: null,
            delayDaysOverride: 14,
            reason: "Commerce protected seller liabilities",
        });
        expect(sellerPayoutBody).toBeUndefined();
        expect(recordPaymentBody).toEqual({
            orderPublicId: "order-public-42",
            providerEventId: "payment-checkout-sync:9:2026-07-13T00:00:00.000Z",
            providerPaymentId: 9,
            providerPaymentIntentId: "pi_9",
            status: "requires_action",
            amount: 2500,
            currency: "EUR",
            financialTermsHash: "terms_hash_42",
            occurredAt: "2026-07-13T00:00:00.000Z",
            providerSnapshot: {
                paymentId: 9,
                stripePaymentIntentId: "pi_9",
                clientReferenceId: "order-public-42",
                paymentStatus: "requires_action",
                commercePaymentStatus: "requires_action",
                settlementStatus: "held",
                disputeStatus: "none",
                refundedAmount: 0,
                transferredAmount: 0,
                reversedAmount: 0,
                amountTotal: 2500,
                sellerTransferAmount: 2250,
                platformRetainedAmount: 250,
                currency: "EUR",
                financialTermsHash: "terms_hash_42",
                updatedAt: "2026-07-13T00:00:00.000Z",
            },
        });

        const orderInput = {
            idempotencyKey: "protected-checkout-42",
            items: [{ offerId: "91", quantity: 1 }],
            shippingAddress: { city: "Paris" },
            billingAddress: { city: "Paris" },
        };
        const protectedOrderResponse = await executeFunction(protectedOrderFn, new Request(
            "https://cms.test/functions/createProtectedOrder",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(orderInput),
            },
        ), {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/protected-checkout/seller-context")) {
                        expect(await request.json()).toEqual({ items: orderInput.items });
                        return Response.json({
                            sellerCmsUserId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        return Response.json({ eligible: true, reasonCode: "eligible" });
                    }
                    if (request.url.startsWith("https://commerce.test/order/create")) {
                        expect(await request.json()).toEqual(orderInput);
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            status: "awaiting_quote",
                            currency: "eur",
                            subtotalAmount: 2000,
                            totalAmount: 2000,
                        }, { status: 201 });
                    }
                    throw new Error(`unexpected protected-order call: ${request.url}`);
                },
            },
        });
        expect(protectedOrderResponse.status).toBe(200);
        expect(await protectedOrderResponse.json()).toEqual({
            id: 42,
            publicId: "order-public-42",
            status: "awaiting_quote",
            currency: "eur",
            subtotalAmount: 2000,
            totalAmount: 2000,
        });

        let reservationAttempted = false;
        const blockedOrderResponse = await executeFunction(protectedOrderFn, new Request(
            "https://cms.test/functions/createProtectedOrder",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(orderInput),
            },
        ), {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/protected-checkout/seller-context")) {
                        return Response.json({
                            sellerCmsUserId: "legacy-seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        return Response.json({ eligible: false, reasonCode: "seller_terms_not_current" });
                    }
                    reservationAttempted = true;
                    throw new Error(`unexpected mutation after failed eligibility: ${request.url}`);
                },
            },
        });
        expect(blockedOrderResponse.status).toBe(409);
        expect(await blockedOrderResponse.json()).toEqual({ error: "SELLER_PROTECTED_PAYMENT_NOT_READY" });
        expect(reservationAttempted).toBeFalse();

        let paymentPreparationAttempted = false;
        const blockedPaymentResponse = await executeFunction(fn, new Request(
            "https://cms.test/functions/createPaymentForOrder",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ orderId: 42 }),
            },
        ), {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/protected-payment/seller-context")) {
                        return Response.json({
                            sellerCmsUserId: "legacy-seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        return Response.json({ eligible: false, reasonCode: "seller_terms_not_current" });
                    }
                    paymentPreparationAttempted = true;
                    throw new Error(`unexpected payment mutation after failed eligibility: ${request.url}`);
                },
            },
        });
        expect(blockedPaymentResponse.status).toBe(409);
        expect(await blockedPaymentResponse.json()).toEqual({ error: "SELLER_PROTECTED_PAYMENT_NOT_READY" });
        expect(paymentPreparationAttempted).toBeFalse();

        // A browser reload deliberately calls the idempotent provider endpoint again so it can
        // recover the existing client secret. Commerce projection identity must follow the
        // returned provider snapshot: the exact same snapshot is an idempotent replay, while a
        // later provider sync for that same PaymentIntent is a distinct projection event.
        const projectionClaims = new Map<string, string>();
        const initialProjection = recordPaymentBody as Record<string, unknown>;
        projectionClaims.set(String(initialProjection.providerEventId), JSON.stringify(initialProjection));
        const replayProviderBodies: unknown[] = [];
        const replayProjectionBodies: Array<Record<string, unknown>> = [];
        const runCheckoutReplay = async (
            updatedAt: string,
            commercePaymentStatus = "requires_action",
        ) => executeFunction(fn, new Request(
            "https://cms.test/functions/createPaymentForOrder",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ orderId: 42 }),
            },
        ), {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/protected-payment/seller-context")) {
                        return Response.json({
                            sellerCmsUserId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        return Response.json({ eligible: true, reasonCode: "eligible" });
                    }
                    if (request.url.startsWith("https://commerce.test/payment/prepare")) {
                        return Response.json({
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            orderNumber: "ORDER-42",
                            sellerId: "seller-subject",
                            buyerTotalAmount: 2500,
                            sellerProceedsAmount: 2250,
                            sellerTransferReleaseAmount: 2050,
                            sellerReserveLiabilityAmount: 200,
                            currency: "EUR",
                            financialTermsHash: "terms_hash_42",
                            financialRevision: 3,
                            protectionRequired: true,
                            payoutDelayDays: 14,
                            dualApprovalThresholdAmount: 1000,
                            sellerRequiredMinimumBalanceAmount: 0,
                            platformRequiredMinimumBalanceAmount: 2250,
                            platformLiabilityRevision: 7,
                            platformPayoutDecreaseAuthorizationId: null,
                            platformPayoutChangeDirection: "increase",
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/payment/record")) {
                        const projection = await request.json() as Record<string, unknown>;
                        replayProjectionBodies.push(projection);
                        const eventId = String(projection.providerEventId);
                        const payload = JSON.stringify(projection);
                        const claimed = projectionClaims.get(eventId);
                        if (claimed !== undefined && claimed !== payload) {
                            return Response.json(
                                { error: "provider event replay changed canonical payload" },
                                { status: 409 },
                            );
                        }
                        projectionClaims.set(eventId, payload);
                        return Response.json({
                            paymentStatus: "requires_action",
                            settlementStatus: "held",
                            idempotentReplay: claimed !== undefined,
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/payout/platform")) {
                        return Response.json({
                            liabilityRevision: 7,
                            appliedMinimumBalanceEur: 2250,
                            decreaseAuthorizationId: null,
                            payoutControl: { interval: "manual" },
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/recordPlatformPayoutLiabilityApplied")) {
                        return Response.json({ accepted: true, needsReapply: false });
                    }
                    const providerBody = await request.json();
                    replayProviderBodies.push(providerBody);
                    return Response.json({
                        paymentId: 9,
                        stripePaymentIntentId: "pi_9",
                        clientSecret: "pi_9_secret_test",
                        clientReferenceId: "order-public-42",
                        paymentStatus: "requires_action",
                        commercePaymentStatus,
                        settlementStatus: commercePaymentStatus === "manual_review" ? "manual_review" : "held",
                        ...(commercePaymentStatus === "manual_review"
                            ? { manualReviewReason: "Provider truth is awaiting reconciliation" }
                            : {}),
                        disputeStatus: "none",
                        refundedAmount: 0,
                        transferredAmount: 0,
                        reversedAmount: 0,
                        sellerTransferAmount: 2250,
                        platformRetainedAmount: 250,
                        amountTotal: 2500,
                        currency: "EUR",
                        financialTermsHash: "terms_hash_42",
                        updatedAt,
                    });
                },
            },
        });

        const exactReplay = await runCheckoutReplay("2026-07-13T00:00:00.000Z");
        const laterSyncReplay = await runCheckoutReplay("2026-07-13T00:01:00.000Z");
        const manualReviewReplay = await runCheckoutReplay("2026-07-13T00:02:00.000Z", "manual_review");
        expect(exactReplay.status).toBe(200);
        expect(laterSyncReplay.status).toBe(200);
        expect(manualReviewReplay.status).toBe(200);
        expect((await exactReplay.json()).clientSecret).toBe("pi_9_secret_test");
        expect((await laterSyncReplay.json()).clientSecret).toBe("pi_9_secret_test");
        expect(await manualReviewReplay.json()).toMatchObject({
            status: "manual_review",
            paymentStatus: "requires_action",
            commercePaymentStatus: "manual_review",
            settlementStatus: "manual_review",
        });
        expect(replayProviderBodies).toEqual([paymentBody, paymentBody, paymentBody]);
        expect(replayProjectionBodies.map(body => body.providerEventId)).toEqual([
            "payment-checkout-sync:9:2026-07-13T00:00:00.000Z",
            "payment-checkout-sync:9:2026-07-13T00:01:00.000Z",
            "payment-checkout-sync:9:2026-07-13T00:02:00.000Z",
        ]);
        expect(replayProjectionBodies[2]?.status).toBe("manual_review");
        expect(replayProjectionBodies[2]?.providerSnapshot).toMatchObject({
            paymentStatus: "requires_action",
            commercePaymentStatus: "manual_review",
            settlementStatus: "manual_review",
            manualReviewReason: "Provider truth is awaiting reconciliation",
            transferredAmount: 0,
            reversedAmount: 0,
        });
        expect(projectionClaims.size).toBe(3);

        let refreshedPaymentBody: unknown;
        const paymentStatusResponse = await executeFunction(refreshFn, new Request(
            "https://cms.test/functions/refreshPaymentForOrder",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: 42 }) },
        ), {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/payment/record")) {
                        refreshedPaymentBody = await request.json();
                        return Response.json({ paymentStatus: "succeeded", settlementStatus: "held" });
                    }
                    if (request.url.startsWith("https://commerce.test")) {
                        return Response.json({
                    id: 42,
                            publicId: "order-public-42",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    expect(new URL(request.url).searchParams.get("clientReferenceId"))
                        .toBe("order-public-42");
                    return Response.json({
                        exists: true,
                        payment: {
                            paymentId: 9,
                            paymentStatus: "succeeded",
                            commercePaymentStatus: "manual_review",
                            settlementStatus: "manual_review",
                            disputeStatus: "none",
                            reconciliationPending: true,
                            refundedAmount: 0,
                            manualReviewReason: "Provider truth is awaiting reconciliation",
                            amountTotal: 2500,
                            currency: "EUR",
                            financialTermsHash: "terms_hash_42",
                            stripePaymentIntentId: "pi_9",
                            stripeChargeId: "ch_9",
                            buyerUserId: "buyer-subject",
                            sellerUserId: "seller-subject",
                            platformRetainedAmount: 250,
                            actualPlatformMarginAfterStripeAmount: 175,
                            updatedAt: "2026-07-13T00:01:00.000Z",
                        },
                    });
                },
            },
        });
        expect(paymentStatusResponse.status).toBe(200);
        expect(await paymentStatusResponse.json()).toEqual({
            orderId: 42,
            orderPublicId: "order-public-42",
            payment: {
                paymentStatus: "succeeded",
                settlementStatus: "manual_review",
                disputeStatus: "none",
                reconciliationPending: true,
                refundedAmount: 0,
                amountTotal: 2500,
                currency: "EUR",
            },
        });
        expect(refreshedPaymentBody).toMatchObject({
            orderPublicId: "order-public-42",
            providerEventId: "payment-sync:9:2026-07-13T00:01:00.000Z",
            providerPaymentId: 9,
            status: "manual_review",
            providerChargeId: "ch_9",
            providerPaymentIntentId: "pi_9",
            providerSnapshot: {
                buyerUserId: "buyer-subject",
                sellerUserId: "seller-subject",
                financialTermsHash: "terms_hash_42",
                platformRetainedAmount: 250,
            },
        });

        const existingPaymentStatus = await executeFunction(statusFn, new Request(
            "https://cms.test/functions/getPaymentForOrder?orderId=42",
        ), {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async input => {
                    const request = new Request(input);
                    if (request.url.startsWith("https://commerce.test")) {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    return Response.json({
                        exists: true,
                        payment: {
                            paymentId: 9,
                            paymentStatus: "succeeded",
                            commercePaymentStatus: "succeeded",
                            settlementStatus: "held",
                            disputeStatus: "none",
                            reconciliationPending: false,
                            refundedAmount: 0,
                            amountTotal: 2500,
                            currency: "EUR",
                            financialTermsHash: "terms_hash_42",
                            stripePaymentIntentId: "pi_9",
                            stripeChargeId: "ch_9",
                            buyerUserId: "buyer-subject",
                            sellerUserId: "seller-subject",
                            platformRetainedAmount: 250,
                            actualPlatformMarginAfterStripeAmount: 175,
                            manualReviewReason: "internal-only reason",
                            updatedAt: "2026-07-13T00:01:00.000Z",
                        },
                    });
                },
            },
        });
        expect(existingPaymentStatus.status).toBe(200);
        expect(await existingPaymentStatus.json()).toEqual({
            orderId: 42,
            orderPublicId: "order-public-42",
            paymentExists: true,
            payment: {
                paymentStatus: "succeeded",
                settlementStatus: "held",
                disputeStatus: "none",
                reconciliationPending: false,
                refundedAmount: 0,
                amountTotal: 2500,
                currency: "EUR",
            },
        });

        const missingPaymentStatus = await executeFunction(statusFn, new Request(
            "https://cms.test/functions/getPaymentForOrder?orderId=42",
        ), {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async input => {
                    const request = new Request(input);
                    if (request.url.startsWith("https://commerce.test")) {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    expect(new URL(request.url).searchParams.get("clientReferenceId"))
                        .toBe("order-public-42");
                    return Response.json({ exists: false });
                },
            },
        });
        expect(missingPaymentStatus.status).toBe(200);
        expect(await missingPaymentStatus.json()).toEqual({
            orderId: 42,
            orderPublicId: "order-public-42",
            paymentExists: false,
        });

        let missingPaymentProjected = false;
        const missingPaymentRefresh = await executeFunction(refreshFn, new Request(
            "https://cms.test/functions/refreshPaymentForOrder",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ orderId: 42 }),
            },
        ), {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async input => {
                    const request = new Request(input);
                    if (request.url.startsWith("https://commerce.test/payment/record")) {
                        missingPaymentProjected = true;
                        return Response.json({});
                    }
                    if (request.url.startsWith("https://commerce.test")) {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    return Response.json({ exists: false });
                },
            },
        });
        expect(missingPaymentRefresh.status).toBe(404);
        expect(await missingPaymentRefresh.json()).toEqual({
            error: "Payment does not exist for this order",
        });
        expect(missingPaymentProjected).toBeFalse();

        let releaseBody: unknown;
        let releaseProjectionBody: unknown;
        const releaseCalls: string[] = [];
        const releaseResponse = await executeFunction(releaseFn, new Request(
            "https://cms.test/functions/executeAuthorizedSettlementRelease",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    status: "authorized",
                    releaseAuthorizationId: "release-42",
                    orderId: 42,
                    orderPublicId: "order-public-42",
                    paymentId: 9,
                    businessKey: "settlement:9:release-42",
                    releaseKind: "initial",
                    sellerId: "seller-subject",
                    sellerRequiredMinimumBalanceAmount: 0,
                    payoutDelayDays: 14,
                    amount: 2050,
                    currency: "EUR",
                    financialTermsHash: "terms_hash_42",
                }),
            },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                releaseCalls.push(new URL(request.url).pathname);
                if (request.url.startsWith("https://stripe.test/payout/seller")) {
                    sellerPayoutBody = await request.json();
                    return Response.json({ payoutControl: { interval: "weekly" } });
                }
                if (request.url.startsWith("https://stripe.test/settlement/release")) {
                    releaseBody = await request.json();
                    return Response.json({
                        providerOperationId: 71,
                        paymentId: 9,
                        releaseAuthorizationId: "release-42",
                        amount: 2050,
                        currency: "EUR",
                        status: "succeeded",
                        occurredAt: "2026-07-13T00:02:00.000Z",
                        updatedAt: "2026-07-13T00:02:00.000Z",
                    });
                }
                if (request.url.startsWith("https://commerce.test/settlement/record")) {
                    releaseProjectionBody = await request.json();
                    return Response.json({ settlementStatus: "released" });
                }
                throw new Error(`unexpected release call: ${request.url}`);
            } },
        });
        expect(releaseResponse.status).toBe(200);
        expect(sellerPayoutBody).toEqual({
            userId: "seller-subject",
            payoutScheduleChangeId: "settlement-release:release-42:0:14",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            minimumBalanceEur: 0,
            delayDaysOverride: 14,
            reason: "Commerce authorized settlement release",
        });
        expect(releaseCalls).toEqual([
            "/payout/seller",
            "/settlement/release",
            "/settlement/record",
        ]);
        expect(releaseBody).toEqual({
            paymentId: 9,
            releaseAuthorizationId: "release-42",
            releaseKind: "initial",
            amount: 2050,
            currency: "EUR",
        });
        expect(releaseProjectionBody).toMatchObject({
            orderPublicId: "order-public-42",
            providerEventId: "transfer:71:2026-07-13T00:02:00.000Z",
            operationType: "transfer",
            providerOperationId: 71,
            status: "succeeded",
            amount: 2050,
            releaseAuthorizationId: "release-42",
        });

        let blockedTransferCalled = false;
        const blockedReleaseResponse = await executeFunction(releaseFn, new Request(
            "https://cms.test/functions/executeAuthorizedSettlementRelease",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    status: "authorized",
                    releaseAuthorizationId: "release-43",
                    orderId: 43,
                    orderPublicId: "order-public-43",
                    paymentId: 10,
                    businessKey: "settlement:10:release-43",
                    releaseKind: "initial",
                    sellerId: "seller-subject",
                    sellerRequiredMinimumBalanceAmount: 0,
                    payoutDelayDays: 14,
                    amount: 1800,
                    currency: "EUR",
                    financialTermsHash: "terms_hash_43",
                }),
            },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async (input) => {
                const request = new Request(input);
                if (request.url.startsWith("https://stripe.test/payout/seller")) {
                    return Response.json(
                        { error: "seller payout controls are not currently applicable" },
                        { status: 409 },
                    );
                }
                if (request.url.startsWith("https://stripe.test/settlement/release")) {
                    blockedTransferCalled = true;
                }
                throw new Error(`unexpected blocked release call: ${request.url}`);
            } },
        });
        expect(blockedReleaseResponse.status).toBe(502);
        expect(blockedTransferCalled).toBe(false);

        let protectedRefundBody: unknown;
        const refundProjectionBodies: unknown[] = [];
        const refundResponse = await executeFunction(refundFn, new Request(
            "https://cms.test/functions/executeAuthorizedRefund",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    status: "approved",
                    orderId: 42,
                    orderPublicId: "order-public-42",
                    providerPaymentId: 9,
                    refundRequestId: "refund:42:1",
                    commerceRefundRequestId: 1,
                    businessKey: "refund:42:1",
                    amount: 2500,
                    authorizedSellerAmount: 0,
                    sellerEntitlementReductionAmount: 2050,
                    sellerRecoveryAmount: 2050,
                    protectionFeeRefundAmount: 100,
                    currency: "EUR",
                    financialTermsHash: "terms_hash_42",
                    requiresFinanceApproval: true,
                }),
            },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://stripe.test/refund/protected")) {
                    protectedRefundBody = await request.json();
                    const operations = [
                        {
                            providerEventId: "reversal:81:succeeded",
                            providerOperationId: 81,
                            operationType: "reversal",
                            providerOperationObjectId: "trr_81",
                            status: "succeeded",
                            amount: 2050,
                            currency: "EUR",
                            occurredAt: "2026-07-13T00:03:00.000Z",
                            refundRequestId: "refund:42:1",
                            providerSnapshot: { stripeTransferReversalId: "trr_81" },
                        },
                        {
                            providerEventId: "refund:82:processing",
                            providerOperationId: 82,
                            operationType: "refund",
                            providerOperationObjectId: "re_82",
                            status: "processing",
                            amount: 2500,
                            currency: "EUR",
                            occurredAt: "2026-07-13T00:03:01.000Z",
                            refundRequestId: "refund:42:1",
                            providerSnapshot: { stripeRefundId: "re_82" },
                        },
                    ];
                    return Response.json({ payment: { paymentId: 9 }, reversal: {}, refund: {}, operations });
                }
                if (request.url.startsWith("https://commerce.test/settlement/record")) {
                    refundProjectionBodies.push(await request.json());
                    return Response.json({ settlementStatus: "blocked" });
                }
                throw new Error(`unexpected refund call: ${request.url}`);
            } },
        });
        expect(refundResponse.status).toBe(200);
        expect(protectedRefundBody).toEqual({
            paymentId: 9,
            refundRequestId: "refund:42:1",
            commerceRefundRequestId: 1,
            amount: 2500,
            authorizedSellerAmount: 0,
            sellerEntitlementReductionAmount: 2050,
            reason: "Commerce authorized refund",
        });
        expect(refundProjectionBodies).toHaveLength(2);
        expect(refundProjectionBodies.map(body => (body as Record<string, unknown>).operationType))
            .toEqual(["reversal", "refund"]);
        expect(refundProjectionBodies[1]).toMatchObject({
            orderPublicId: "order-public-42",
            providerEventId: "provider-operation:82:processing:2026-07-13T00:03:01.000Z",
            providerOperationId: 82,
            status: "processing",
            amount: 2500,
            refundRequestId: "refund:42:1",
            commerceRefundRequestId: 1,
        });
        const unapprovedRefund = await executeFunction(refundFn, new Request(
            "https://cms.test/functions/executeAuthorizedRefund",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    status: "requested",
                    orderId: 42,
                    orderPublicId: "order-public-42",
                    providerPaymentId: 9,
                    refundRequestId: "refund:42:2",
                    commerceRefundRequestId: 2,
                    businessKey: "refund:42:2",
                    amount: 2500,
                    authorizedSellerAmount: 0,
                    sellerEntitlementReductionAmount: 2050,
                    sellerRecoveryAmount: 2050,
                    protectionFeeRefundAmount: 100,
                    currency: "EUR",
                    financialTermsHash: "terms_hash_42",
                    requiresFinanceApproval: true,
                }),
            },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async () => {
                throw new Error("provider must not be called for an unapproved refund");
            } },
        });
        expect(unapprovedRefund.status).toBe(409);
        expect(await unapprovedRefund.json()).toEqual({ error: "Refund is not fully authorized" });

        let deadlineWorkerBody: unknown;
        const deadlineWorkerResponse = await executeFunction(deadlineWorker, new Request(
            "https://cms.test/functions/processDueOrderDeadlines",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runKey: "deadline-run-1", limit: 5 }) },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                deadlineWorkerBody = await request.json();
                return Response.json({ runKey: "deadline-run-1", processed: 0, events: [] });
            } },
        });
        expect(deadlineWorkerResponse.status).toBe(200);
        expect(deadlineWorkerBody).toEqual({ runKey: "deadline-run-1", limit: 5 });

        let cancellationPending = true;
        const cancellationProviderBodies: unknown[] = [];
        const cancellationProjectionBodies: unknown[] = [];
        const runCancellationTick = async (runKey: string) => await executeFunction(cancellationWorker, new Request(
            "https://cms.test/functions/dispatchPendingPaymentCancellations",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runKey, limit: 5 }) },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("pendingPaymentCancellationAuthorizations")) {
                    return Response.json({
                        runKey,
                        authorizations: cancellationPending ? [{
                            status: "processing", paymentCancellationRequestId: 31,
                            cancellationRequestId: "payment-cancellation:deadline:42",
                            orderId: 42, orderPublicId: "order-public-42", clientReferenceId: "order-public-42",
                            targetOrderStatus: "expired", reason: "Payment deadline expired",
                            amount: 2500, currency: "EUR", financialTermsHash: "terms_hash_42",
                        }] : [],
                    });
                }
                if (request.url === "https://stripe.test/payment/cancel") {
                    cancellationProviderBodies.push(await request.json());
                    const payment = {
                        paymentId: 9, stripePaymentIntentId: "pi_9",
                        clientReferenceId: "order-public-42", paymentStatus: "cancelled",
                        amountTotal: 2500, currency: "EUR", financialTermsHash: "terms_hash_42",
                        updatedAt: "2026-07-13T00:01:30.000Z",
                    };
                    return Response.json({
                        cancellationRequestId: "payment-cancellation:deadline:42",
                        providerOperationId: 91,
                        providerStatus: "canceled",
                        providerPaymentAbsent: false,
                        providerEventId: "payment-cancellation:91:2026-07-13T00:01:30.000Z",
                        providerPaymentId: 9,
                        providerPaymentIntentId: "pi_9",
                        paymentStatus: "cancelled",
                        amount: 2500,
                        currency: "EUR",
                        financialTermsHash: "terms_hash_42",
                        occurredAt: "2026-07-13T00:01:30.000Z",
                        providerSnapshot: payment,
                        payment,
                    });
                }
                if (request.url === "https://commerce.test/payment/record") {
                    cancellationProjectionBodies.push(await request.json());
                    cancellationPending = false;
                    return Response.json({ status: "cancelled", idempotentReplay: false });
                }
                throw new Error(`unexpected cancellation worker call: ${request.url}`);
            } },
        });

        expect((await runCancellationTick("payment-cancellation-recovery-1")).status).toBe(200);
        expect((await runCancellationTick("payment-cancellation-recovery-2")).status).toBe(200);
        expect(cancellationProviderBodies).toEqual([{
            clientReferenceId: "order-public-42",
            cancellationRequestId: "payment-cancellation:deadline:42",
            reason: "Payment deadline expired",
        }]);
        expect(cancellationProjectionBodies).toEqual([expect.objectContaining({
            orderPublicId: "order-public-42",
            providerEventId: "payment-cancellation:91:2026-07-13T00:01:30.000Z",
            providerPaymentId: 9,
            providerPaymentIntentId: "pi_9",
            status: "cancelled",
            amount: 2500,
            financialTermsHash: "terms_hash_42",
        })]);

        let absentProjectionBody: JsonRecord | null = null;
        const absentCancellationTick = await executeFunction(cancellationWorker, new Request(
            "https://cms.test/functions/dispatchPendingPaymentCancellations",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runKey: "payment-cancellation-absent", limit: 1 }) },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("pendingPaymentCancellationAuthorizations")) return Response.json({
                    runKey: "payment-cancellation-absent",
                    authorizations: [{
                        status: "requested", paymentCancellationRequestId: 32,
                        cancellationRequestId: "payment-cancellation:deadline:43",
                        orderId: 43, orderPublicId: "order-public-43", clientReferenceId: "order-public-43",
                        targetOrderStatus: "expired", reason: "Payment deadline expired before provider creation",
                        amount: 1500, currency: "EUR", financialTermsHash: "terms_hash_43",
                    }],
                });
                if (request.url === "https://stripe.test/payment/cancel") return Response.json({
                    cancellationRequestId: "payment-cancellation:deadline:43",
                    providerStatus: "absent",
                    providerPaymentAbsent: true,
                    providerEventId: "payment-cancellation-absent:payment-cancellation:deadline:43",
                    occurredAt: "2026-07-13T00:02:30.000Z",
                });
                if (request.url === "https://commerce.test/payment/record") {
                    absentProjectionBody = await request.json() as JsonRecord;
                    return Response.json({ status: "completed", providerPaymentAbsent: true });
                }
                throw new Error(`unexpected absent cancellation worker call: ${request.url}`);
            } },
        });
        expect(absentCancellationTick.status).toBe(200);
        expect(absentProjectionBody).toEqual({
            orderPublicId: "order-public-43",
            providerEventId: "payment-cancellation-absent:payment-cancellation:deadline:43",
            occurredAt: "2026-07-13T00:02:30.000Z",
            providerPaymentAbsent: true,
            cancellationRequestId: "payment-cancellation:deadline:43",
        });

        const releaseWorkerCalls: string[] = [];
        const releaseWorkerPayoutBodies: unknown[] = [];
        const releaseWorkerResponse = await executeFunction(releaseWorker, new Request(
            "https://cms.test/functions/dispatchDueProtectedSettlements",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runKey: "release-run-1", limit: 10 }) },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                releaseWorkerCalls.push(new URL(request.url).pathname);
                if (request.url.includes("authorizeDueOrderReleases")) return Response.json({
                    runKey: "release-run-1",
                    authorizations: [{
                        status: "authorized", releaseAuthorizationId: "release-42", orderId: 42,
                        orderPublicId: "order-public-42", paymentId: 9, businessKey: "settlement:9:release-42",
                        releaseKind: "initial", sellerId: "seller-subject",
                        sellerRequiredMinimumBalanceAmount: 0, payoutDelayDays: 14,
                        amount: 2050, currency: "EUR", financialTermsHash: "terms_hash_42",
                    }],
                });
                if (request.url.includes("/payout/seller")) {
                    releaseWorkerPayoutBodies.push(await request.json());
                    return Response.json({ payoutControl: { interval: "weekly" } });
                }
                if (request.url.includes("/settlement/release")) return Response.json({
                    providerOperationId: 71, paymentId: 9, releaseAuthorizationId: "release-42",
                    amount: 2050, currency: "EUR", status: "succeeded",
                    occurredAt: "2026-07-13T00:02:00.000Z", updatedAt: "2026-07-13T00:02:00.000Z",
                });
                if (request.url.includes("/settlement/record")) return Response.json({ status: "released" });
                throw new Error(`unexpected release worker call: ${request.url}`);
            } },
        });
        expect(releaseWorkerResponse.status).toBe(200);
        expect(releaseWorkerCalls).toEqual([
            "/authorizeDueOrderReleases",
            "/payout/seller",
            "/settlement/release",
            "/settlement/record",
        ]);
        expect(releaseWorkerPayoutBodies).toEqual([{
            userId: "seller-subject",
            payoutScheduleChangeId: "settlement-release:release-42:0:14",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            minimumBalanceEur: 0,
            delayDaysOverride: 14,
            reason: "Commerce authorized settlement release",
        }]);

        let retriedRefundBody: unknown;
        const refundWorkerResponse = await executeFunction(refundWorker, new Request(
            "https://cms.test/functions/dispatchPendingProtectedRefunds",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runKey: "refund-run-1", limit: 10 }) },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("pendingOrderRefundAuthorizations")) return Response.json({
                    runKey: "refund-run-1",
                    authorizations: [{
                        status: "processing", orderId: 42, orderPublicId: "order-public-42", providerPaymentId: 9,
                        refundRequestId: "refund:42:1", commerceRefundRequestId: 1, businessKey: "refund:42:1",
                        amount: 2500, authorizedSellerAmount: 0, sellerEntitlementReductionAmount: 2050,
                        sellerRecoveryAmount: 2050, protectionFeeRefundAmount: 100,
                        currency: "EUR", financialTermsHash: "terms_hash_42", requiresFinanceApproval: true,
                    }],
                });
                if (request.url.includes("/refund/protected")) {
                    retriedRefundBody = await request.json();
                    return Response.json({ payment: { paymentId: 9 }, reversal: null, refund: {}, operations: [] });
                }
                throw new Error(`unexpected refund worker call: ${request.url}`);
            } },
        });
        expect(refundWorkerResponse.status).toBe(200);
        expect(retriedRefundBody).toEqual({
            paymentId: 9,
            refundRequestId: "refund:42:1",
            commerceRefundRequestId: 1,
            amount: 2500,
            authorizedSellerAmount: 0,
            sellerEntitlementReductionAmount: 2050,
            reason: "Commerce authorized refund retry",
        });

        const reconciliationProjections: string[] = [];
        let reconciliationPaymentBody: unknown;
        let reconciliationOperationBody: unknown;
        let reconciliationDisputeBody: unknown;
        const reconciliationResponse = await executeFunction(reconciliationWorker, new Request(
            "https://cms.test/functions/reconcileProtectedPaymentSystems",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runKey: "reconcile-run-1", limit: 5 }) },
        ), {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("pendingPlatformPayoutLiabilityAuthorizations")) {
                    return Response.json({
                        runKey: "reconcile-run-1",
                        control: { liabilityRevision: 7, requiredMinimumAmount: 2250 },
                        authorizations: [],
                    });
                }
                if (request.url.includes("/reconciliation/projections/ack")) return Response.json({ acknowledged: true });
                if (request.url === "https://stripe.test/reconciliation") return Response.json({
                    runId: 1,
                    runKey: "reconcile-run-1",
                    status: "succeeded",
                    payments: [{
                        paymentId: 9, clientReferenceId: "order-public-42", paymentStatus: "succeeded",
                        providerEventId: "payment-projection-101",
                        stripePaymentIntentId: "pi_9",
                        amountTotal: 2500, currency: "EUR", financialTermsHash: "terms_hash_42",
                        occurredAt: "2026-07-13T00:04:00.000Z", stripeChargeId: "ch_9", updatedAt: "2026-07-13T00:04:00.000Z",
                        projectionId: 101, projectionClaimToken: "claim-payment-101",
                    }],
                    commerceOperations: [{
                        orderPublicId: "order-public-42", providerOperationId: 82, operationType: "refund",
                        providerEventId: "refund:82:succeeded",
                        status: "succeeded", amount: 2500, currency: "EUR", occurredAt: "2026-07-13T00:04:00.000Z",
                        updatedAt: "2026-07-13T00:04:00.000Z", releaseAuthorizationId: null,
                        refundRequestId: "refund:42:1", commerceRefundRequestId: 1, providerSnapshot: { id: "re_82" },
                        projectionId: 102, projectionClaimToken: "claim-operation-102",
                    }],
                    disputes: [{
                        id: "dp_1", clientReferenceId: "order-public-42", status: "needs_response", reason: "fraudulent",
                        providerEventId: "dispute:31:evt_31:needs_response:withdrawn",
                        amount: 2500, currency: "EUR", createdAt: "2026-07-12T00:00:00.000Z",
                        updatedAt: "2026-07-13T00:04:00.000Z", evidenceDueBy: "2026-07-20T00:00:00.000Z",
                        projectionId: 103, projectionClaimToken: "claim-dispute-103",
                    }],
                });
                reconciliationProjections.push(new URL(request.url).pathname);
                if (new URL(request.url).pathname === "/payment/record") {
                    reconciliationPaymentBody = await request.json();
                }
                if (new URL(request.url).pathname === "/settlement/record") {
                    reconciliationOperationBody = await request.json();
                }
                if (new URL(request.url).pathname === "/recordOrderStripeDispute") {
                    reconciliationDisputeBody = await request.json();
                }
                return Response.json({ idempotentReplay: false });
            } },
        });
        expect(reconciliationResponse.status).toBe(200);
        expect(reconciliationProjections).toEqual([
            "/payment/record",
            "/settlement/record",
            "/recordOrderStripeDispute",
        ]);
        expect(reconciliationPaymentBody).toMatchObject({
            providerEventId: "payment-projection-101",
            providerPaymentId: 9,
        });
        expect(reconciliationOperationBody).toMatchObject({
            providerEventId: "refund:82:succeeded",
            providerOperationId: 82,
        });
        expect(reconciliationDisputeBody).toMatchObject({
            providerEventId: "dispute:31:evt_31:needs_response:withdrawn",
            providerDisputeId: "dp_1",
        });

        const seller = {
            exists: true,
            id: 184,
            cmsUserId: "seller-subject",
            verificationStatus: "pending",
            version: 1,
        };
        const assertCurrentTermsQuery = (request: Request) => {
            const url = new URL(request.url);
            expect(url.searchParams.get("marketplaceTermsVersion")).toBe(SELLER_TERMS_VERSION);
            expect(url.searchParams.get("marketplaceTermsHash")).toBe(SELLER_TERMS_HASH);
        };
        const enrollmentResponse = await executeFunction(enrollmentFn, new Request(
            "https://cms.test/functions/getSellerSaleEnrollment",
        ), {
            sources, identities, user: { id: "seller-subject", role: "user" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://stripe.test/status")) {
                    assertCurrentTermsQuery(request);
                    return Response.json({
                        ...connectStatus({ enrolled: true, currentTermsAccepted: true }),
                        marketplaceTermsVersion: SELLER_TERMS_VERSION,
                        marketplaceTermsHash: SELLER_TERMS_HASH,
                        marketplaceTermsAcceptedAt: "2026-07-13T12:00:00.000Z",
                    });
                }
                if (request.url.startsWith("https://commerce.test/seller")) return Response.json(seller);
                throw new Error(`unexpected enrollment read call: ${request.url}`);
            } },
        });
        expect(enrollmentResponse.status).toBe(200);
        const enrollment = await enrollmentResponse.json() as Record<string, any>;
        expect(enrollment).toMatchObject({
            seller: { verificationStatus: "pending" },
            connect: {
                canAcceptHeldPayments: true,
                marketplaceTermsCurrentVersionAccepted: true,
                payoutsEnabled: false,
                canReceiveProtectedPayments: false,
                stripeTransfersStatus: "unrequested",
                bankAccountStatus: "not_attached",
                payoutBankReady: false,
            },
        });
        expect(enrollment.connect.marketplaceTermsVersion).toBeUndefined();
        expect(enrollment.connect.marketplaceTermsHash).toBeUndefined();
        expect(enrollment.connect.marketplaceTermsAcceptedAt).toBeUndefined();

        const serializedSubmit = JSON.stringify(submitPriceFn);
        expect(serializedSubmit).toContain("enrollConnectSeller");
        expect(serializedSubmit).toContain("canAcceptHeldPayments");
        expect(serializedSubmit).toContain("marketplaceTermsCurrentVersionAccepted");
        expect(serializedSubmit).not.toContain("canReceiveProtectedPayments");
        expect(serializedSubmit).not.toContain("payoutsEnabled");
        expect(serializedSubmit).not.toContain("verificationStatus");
        expect(serializedSubmit).not.toContain("verifyPendingSellerPayoutEligibility");
        expect(serializedSubmit).not.toContain("contactEmail");

        const untrustedContactEmail = await executeFunction(submitPriceFn, new Request(
            "https://cms.test/functions/submitSellerOfferPrice",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    offerId: "42", amount: 12000, expectedVersion: 3,
                    accountToken: "accttok_first", sellerTermsAccepted: true,
                    contactEmail: "attacker@example.test",
                    marketplaceTermsVersion: "attacker-selected-version",
                    marketplaceTermsHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                }),
            },
        ), {
            sources, identities, user: { id: "seller-subject", role: "user" },
            deps: { identities, fetchImpl: async () => { throw new Error("strict input must reject before calls"); } },
        });
        expect(untrustedContactEmail.status).toBe(400);

        const missingTermsConsent = await executeFunction(submitPriceFn, new Request(
            "https://cms.test/functions/submitSellerOfferPrice",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ offerId: "42", amount: 12000, expectedVersion: 3, accountToken: "accttok_first" }),
            },
        ), {
            sources, identities, user: { id: "seller-subject", role: "user" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/seller")) return Response.json(seller);
                if (request.url.startsWith("https://stripe.test/status")) {
                    assertCurrentTermsQuery(request);
                    return Response.json(connectStatus());
                }
                throw new Error(`unexpected missing-consent call: ${request.url}`);
            } },
        });
        expect(missingTermsConsent.status).toBe(409);
        expect(await missingTermsConsent.json()).toEqual({
            error: "The current seller terms must be accepted before submitting a price",
        });

        const missingAccountToken = await executeFunction(submitPriceFn, new Request(
            "https://cms.test/functions/submitSellerOfferPrice",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ offerId: "42", amount: 12000, expectedVersion: 3, sellerTermsAccepted: true }),
            },
        ), {
            sources, identities, user: { id: "seller-subject", role: "user" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/seller")) return Response.json(seller);
                if (request.url.startsWith("https://stripe.test/status")) return Response.json(connectStatus());
                throw new Error(`unexpected missing-token call: ${request.url}`);
            } },
        });
        expect(missingAccountToken.status).toBe(409);
        expect(await missingAccountToken.json()).toEqual({
            error: "Seller enrollment is required before submitting a price",
        });

        let firstEnrollmentBody: unknown;
        let firstPriceBody: unknown;
        const submittedFirstPrice = await executeFunction(submitPriceFn, new Request(
            "https://cms.test/functions/submitSellerOfferPrice",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    offerId: "42", amount: 12000, expectedVersion: 3,
                    accountToken: "accttok_first", sellerTermsAccepted: true,
                }),
            },
        ), {
            sources, identities, user: { id: "seller-subject", role: "user" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/seller")) return Response.json(seller);
                if (request.url.startsWith("https://stripe.test/status")) {
                    assertCurrentTermsQuery(request);
                    return Response.json(connectStatus());
                }
                if (request.url.startsWith("https://stripe.test/enrollment")) {
                    firstEnrollmentBody = await request.json();
                    return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: true }));
                }
                if (request.url.startsWith("https://commerce.test/offer/price")) {
                    expect(new URL(request.url).searchParams.get("id")).toBe("42");
                    firstPriceBody = await request.json();
                    return Response.json({ offer: { id: 42, workflowState: "approved" }, proposal: { amount: 12000 } });
                }
                throw new Error(`unexpected first price call: ${request.url}`);
            } },
        });
        expect(submittedFirstPrice.status).toBe(200);
        expect(await submittedFirstPrice.json()).toEqual({
            offer: { id: 42, workflowState: "approved" },
            proposal: { amount: 12000 },
        });
        expect(firstEnrollmentBody).toEqual({
            accountToken: "accttok_first",
            marketplaceTermsAccepted: true,
            marketplaceTermsVersion: SELLER_TERMS_VERSION,
            marketplaceTermsHash: SELLER_TERMS_HASH,
        });
        expect(firstPriceBody).toEqual({ amount: 12000, expectedVersion: 3 });

        let replayEnrollmentBody: unknown;
        const replayedPrice = await executeFunction(submitPriceFn, new Request(
            "https://cms.test/functions/submitSellerOfferPrice",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ offerId: "42", amount: 12000, expectedVersion: 3 }),
            },
        ), {
            sources, identities, user: { id: "seller-subject", role: "user" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/seller")) return Response.json(seller);
                if (request.url.startsWith("https://stripe.test/status")) {
                    return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: true }));
                }
                if (request.url.startsWith("https://stripe.test/enrollment")) {
                    replayEnrollmentBody = await request.json();
                    return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: true }));
                }
                if (request.url.startsWith("https://commerce.test/offer/price")) {
                    return Response.json({ offer: { id: 42 }, proposal: { amount: 12000 } });
                }
                throw new Error(`unexpected replay call: ${request.url}`);
            } },
        });
        expect(replayedPrice.status).toBe(200);
        expect(replayEnrollmentBody).toEqual({
            marketplaceTermsVersion: SELLER_TERMS_VERSION,
            marketplaceTermsHash: SELLER_TERMS_HASH,
        });

        let renewedTermsBody: unknown;
        const renewedTermsPrice = await executeFunction(submitPriceFn, new Request(
            "https://cms.test/functions/submitSellerOfferPrice",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    offerId: "42", amount: 12000, expectedVersion: 3, sellerTermsAccepted: true,
                }),
            },
        ), {
            sources, identities, user: { id: "seller-subject", role: "user" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/seller")) return Response.json(seller);
                if (request.url.startsWith("https://stripe.test/status")) {
                    return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: false }));
                }
                if (request.url.startsWith("https://stripe.test/enrollment")) {
                    renewedTermsBody = await request.json();
                    return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: true }));
                }
                if (request.url.startsWith("https://commerce.test/offer/price")) {
                    return Response.json({ offer: { id: 42 }, proposal: { amount: 12000 } });
                }
                throw new Error(`unexpected renewed-terms call: ${request.url}`);
            } },
        });
        expect(renewedTermsPrice.status).toBe(200);
        expect(renewedTermsBody).toEqual({
            marketplaceTermsAccepted: true,
            marketplaceTermsVersion: SELLER_TERMS_VERSION,
            marketplaceTermsHash: SELLER_TERMS_HASH,
        });

        let priceCalledAfterFailedEnrollment = false;
        const incompleteEnrollment = await executeFunction(submitPriceFn, new Request(
            "https://cms.test/functions/submitSellerOfferPrice",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    offerId: "42", amount: 12000, expectedVersion: 3,
                    accountToken: "accttok_first", sellerTermsAccepted: true,
                }),
            },
        ), {
            sources, identities, user: { id: "seller-subject", role: "user" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/seller")) return Response.json(seller);
                if (request.url.startsWith("https://stripe.test/status")) return Response.json(connectStatus());
                if (request.url.startsWith("https://stripe.test/enrollment")) return Response.json(
                    connectStatus({ enrolled: true, currentTermsAccepted: false }),
                );
                if (request.url.startsWith("https://commerce.test/offer/price")) {
                    priceCalledAfterFailedEnrollment = true;
                }
                throw new Error(`unexpected incomplete enrollment call: ${request.url}`);
            } },
        });
        expect(incompleteEnrollment.status).toBe(409);
        expect(await incompleteEnrollment.json()).toEqual({
            error: "Seller enrollment is not ready for held payments",
        });
        expect(priceCalledAfterFailedEnrollment).toBe(false);

        const safeProviderFailure = await executeFunction(submitPriceFn, new Request(
            "https://cms.test/functions/submitSellerOfferPrice",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    offerId: "42", amount: 12000, expectedVersion: 3,
                    accountToken: "accttok_first", sellerTermsAccepted: true,
                }),
            },
        ), {
            sources, identities, user: { id: "seller-subject", role: "user" },
            deps: { identities, fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/seller")) return Response.json(seller);
                if (request.url.startsWith("https://stripe.test/status")) return Response.json(connectStatus());
                if (request.url.startsWith("https://stripe.test/enrollment")) {
                    return Response.json(
                        { error: "accttok_first leaked provider detail" },
                        { status: 400 },
                    );
                }
                throw new Error(`unexpected safe-error call: ${request.url}`);
            } },
        });
        expect(safeProviderFailure.status).toBe(502);
        const safeProviderFailureBody = await safeProviderFailure.json() as Record<string, unknown>;
        expect(safeProviderFailureBody).toEqual({
            error: "Function execution failed",
            correlationId: expect.any(String),
        });
        expect(JSON.stringify(safeProviderFailureBody)).not.toContain("accttok_first");
    });
});

function connectStatus({
    enrolled = false,
    currentTermsAccepted = false,
}: {
    enrolled?: boolean;
    currentTermsAccepted?: boolean;
} = {}): Record<string, unknown> {
    const ready = enrolled && currentTermsAccepted;
    return {
        exists: enrolled,
        userId: "seller-subject",
        connected: enrolled,
        ...(enrolled ? { stripeAccountId: "acct_seller", stripeAccountApiVersion: "v2" } : {}),
        onboardingStatus: ready ? "enrolled" : enrolled ? "terms_required" : "not_started",
        payoutsEnabled: false,
        riskStatus: "standard",
        applicationControlledRecipient: enrolled,
        canAcceptHeldPayments: ready,
        canReceiveProtectedPayments: false,
        payoutBankReady: false,
        accountStatus: enrolled ? "active" : "missing",
        termsStatus: ready ? "accepted" : "required",
        stripeTermsStatus: enrolled ? "accepted" : "required",
        marketplaceTermsStatus: currentTermsAccepted ? "accepted" : "required",
        marketplaceTermsCurrentVersionAccepted: currentTermsAccepted,
        enrollmentStatus: ready ? "enrolled" : enrolled ? "terms_required" : "not_started",
        stripeTransfersStatus: "unrequested",
        bankAccountStatus: "not_attached",
        bankPayoutsStatus: "unrequested",
        detailsSubmitted: enrolled,
        chargesEnabled: false,
        currentlyDue: enrolled ? [] : ["identity.individual.given_name"],
        eventuallyDue: [],
        pastDue: [],
        pendingVerification: [],
    };
}

function commerceSource(): Source {
    return {
        urn: makeSourceUrn("commerce"),
        identityAuthority: "commerce",
        endpoints: [
            {
                urn: makeEndpointUrn("commerce", "getProtectedCheckoutSellerContext"),
                method: "POST",
                access: { mode: "system" },
                targetUrl: "https://commerce.test/protected-checkout/seller-context",
                headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                input: { body: { type: "object", properties: {
                    items: { type: "array", items: { type: "object", properties: {
                        offerId: { type: "string" }, quantity: { type: "number" },
                    }, required: ["offerId", "quantity"] } },
                }, required: ["items"] } },
                output: [{ status: "200", body: { type: "object", properties: {
                    sellerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                    buyerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                }, required: ["sellerCmsUserId", "buyerCmsUserId"] } }],
            },
            {
                urn: makeEndpointUrn("commerce", "getProtectedPaymentSellerContext"),
                method: "POST",
                access: { mode: "system" },
                targetUrl: "https://commerce.test/protected-payment/seller-context",
                headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                input: { body: { type: "object", properties: {
                    orderId: { type: "number" },
                }, required: ["orderId"] } },
                output: [{ status: "200", body: { type: "object", properties: {
                    sellerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                    buyerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                }, required: ["sellerCmsUserId", "buyerCmsUserId"] } }],
            },
            {
                urn: makeEndpointUrn("commerce", "createOrder"),
                method: "POST",
                targetUrl: "https://commerce.test/order/create",
                headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                input: { body: { type: "object", properties: {
                    idempotencyKey: { type: "string" },
                    items: { type: "array", items: { type: "object", properties: {
                        offerId: { type: "string" }, quantity: { type: "number" },
                    }, required: ["offerId", "quantity"] } },
                    shippingAddress: { type: "object" }, billingAddress: { type: "object" }, metadata: { type: "object" },
                }, required: ["idempotencyKey", "items"] } },
                output: [{ status: "201", body: { type: "object", properties: {
                    id: { type: "number" }, publicId: { type: "string" }, status: { type: "string" },
                    currency: { type: "string" }, subtotalAmount: { type: "number" }, totalAmount: { type: "number" },
                }, required: ["id", "publicId", "status", "currency", "subtotalAmount", "totalAmount"] } }],
            },
            {
                urn: makeEndpointUrn("commerce", "prepareProtectedPayment"),
                method: "POST",
                access: { mode: "system" },
                targetUrl: "https://commerce.test/payment/prepare",
                headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                input: { body: {
                    type: "object",
                        properties: { orderId: { type: "number" } },
                    required: ["orderId"],
                } },
                output: [{ status: "200", body: { type: "object", properties: {
                    orderId: { type: "number" }, orderPublicId: { type: "string" }, orderNumber: { type: "string" },
                    sellerId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                    buyerTotalAmount: { type: "number" }, sellerProceedsAmount: { type: "number" },
                    sellerTransferReleaseAmount: { type: "number" }, sellerReserveLiabilityAmount: { type: "number" },
                    currency: { type: "string" }, financialTermsHash: { type: "string" },
                    financialRevision: { type: "number" }, protectionRequired: { type: "boolean" },
                    payoutDelayDays: { type: "number" }, sellerRequiredMinimumBalanceAmount: { type: "number" },
                    platformRequiredMinimumBalanceAmount: { type: "number" }, dualApprovalThresholdAmount: { type: "number" },
                    platformLiabilityRevision: { type: "number" },
                    platformPayoutDecreaseAuthorizationId: { type: "string", nullable: true },
                    platformPayoutChangeDirection: { type: "string" },
                    sellerReserveLiabilityDays: { type: "number" },
                } } }],
            },
            {
                urn: makeEndpointUrn("commerce", "recordOrderPayment"),
                method: "POST",
                targetUrl: "https://commerce.test/payment/record",
                input: { body: {
                    type: "object",
                    properties: {
                        orderPublicId: { type: "string" }, providerEventId: { type: "string" },
                        providerPaymentId: { type: "number" }, providerPaymentIntentId: { type: "string" },
                        status: { type: "string" }, amount: { type: "number" },
                        currency: { type: "string" }, financialTermsHash: { type: "string" }, occurredAt: { type: "string" },
                        providerChargeId: { type: "string" }, providerPaymentAbsent: { type: "boolean" },
                        cancellationRequestId: { type: "string" }, providerSnapshot: { type: "object" },
                    },
                    required: ["orderPublicId", "providerEventId", "occurredAt"],
                } },
                output: [{ status: "200", body: { type: "object" } }],
            },
            {
                urn: makeEndpointUrn("commerce", "authorizeOrderRelease"),
                method: "POST",
                targetUrl: "https://commerce.test/settlement/authorize",
                input: { body: { type: "object", properties: {
                    orderId: { type: "number" }, expectedSettlementVersion: { type: "number" },
                    reason: { type: "string" }, actorKind: { type: "string" },
                } } },
                output: [{ status: "200", body: { type: "object", properties: {
                    status: { type: "string" }, releaseAuthorizationId: { type: "string" }, orderId: { type: "number" },
                    orderPublicId: { type: "string" }, paymentId: { type: "number" }, businessKey: { type: "string" },
                    releaseKind: { type: "string" },
                    sellerId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                    sellerRequiredMinimumBalanceAmount: { type: "number" }, payoutDelayDays: { type: "number" },
                    amount: { type: "number" }, currency: { type: "string" }, financialTermsHash: { type: "string" },
                } } }],
            },
            {
                urn: makeEndpointUrn("commerce", "recordOrderSettlement"),
                method: "POST",
                targetUrl: "https://commerce.test/settlement/record",
                input: { body: {
                    type: "object",
                    properties: {
                        orderPublicId: { type: "string" }, providerEventId: { type: "string" }, operationType: { type: "string" },
                        providerOperationId: { type: "number" }, status: { type: "string" }, amount: { type: "number" },
                        currency: { type: "string" }, occurredAt: { type: "string" }, releaseAuthorizationId: { type: "string" },
                        refundRequestId: { type: "string" }, providerSnapshot: { type: "object" },
                        commerceRefundRequestId: { type: "number" },
                    },
                    required: ["orderPublicId", "providerEventId", "operationType", "providerOperationId", "status", "amount", "currency", "occurredAt"],
                } },
                output: [{ status: "200", body: { type: "object" } }],
            },
            {
                urn: makeEndpointUrn("commerce", "myOrder"),
                method: "GET",
                targetUrl: "https://commerce.test/order",
                input: { params: [{ name: "id", in: "query", schema: { type: "string" } }] },
                output: [{ status: "200", body: { type: "object", properties: {
                    id: { type: "number" }, publicId: { type: "string" }, orderNumber: { type: "string" },
                    sellerId: { type: "number", semantic: { kind: "user-id", authority: "commerce" } },
                    buyerCmsUserId: { type: "string" }, subtotalAmount: { type: "number" },
                    totalAmount: { type: "number" }, currency: { type: "string" },
                } } }],
            },
            {
                urn: makeEndpointUrn("commerce", "mySeller"), method: "GET", targetUrl: "https://commerce.test/seller",
                headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                input: { params: [] },
                output: [{ status: "200", body: { type: "object", properties: {
                    exists: { type: "boolean" }, id: { type: "number" }, cmsUserId: { type: "string" },
                    verificationStatus: { type: "string" }, version: { type: "number" },
                } } }],
            },
            {
                urn: makeEndpointUrn("commerce", "reviewSeller"), method: "POST", targetUrl: "https://commerce.test/seller/review",
                input: {
                    params: [{ name: "id", in: "query", schema: { type: "string" } }],
                    body: { type: "object", properties: { status: { type: "string" }, reason: { type: "string" }, expectedVersion: { type: "number" } }, required: ["status", "expectedVersion"] },
                },
                output: [{ status: "200", body: { type: "object", properties: { id: { type: "number" }, verificationStatus: { type: "string" }, version: { type: "number" } } } }],
            },
            {
                urn: makeEndpointUrn("commerce", "submitMyOfferPrice"), method: "POST", targetUrl: "https://commerce.test/offer/price",
                input: {
                    params: [{ name: "id", in: "query", schema: { type: "string" } }],
                    body: { type: "object", properties: { amount: { type: "number" }, expectedVersion: { type: "number" } }, required: ["amount", "expectedVersion"] },
                },
                output: [{ status: "200", body: { type: "object", properties: { offer: { type: "object" }, proposal: { type: "object" } } } }],
            },
            ...commerceOperationsEndpoints(),
        ],
    };
}

function commerceOperationsEndpoints(): Source["endpoints"] {
    const query = (endpointId: string, params: string[] = []) => ({
        urn: makeEndpointUrn("commerce", endpointId),
        method: "GET" as const,
        targetUrl: `https://commerce.test/${endpointId}`,
        input: { params: params.map(name => ({ name, in: "query" as const, schema: { type: "string" as const } })) },
        output: [{ status: "200", body: { type: "object" as const } }],
    });
    const command = (endpointId: string, properties: Record<string, { type: "string" | "number" | "object" }>) => ({
        urn: makeEndpointUrn("commerce", endpointId),
        method: "POST" as const,
        targetUrl: `https://commerce.test/${endpointId}`,
        input: { body: { type: "object" as const, properties } },
        output: [{ status: "200", body: { type: "object" as const } }],
    });
    return [
        query("protectedPayments", ["q", "paymentStatus", "settlementStatus", "limit", "offset"]),
        query("protectedPayment", ["orderId"]),
        command("requestOrderRefund", { orderId: { type: "number" }, reason: { type: "string" }, amount: { type: "number" } }),
        query("claims", ["status", "reason", "limit", "offset"]),
        query("claim", ["id"]),
        query("claimEvidenceItems", ["claimId", "limit", "offset"]),
        query("claimEvidenceItem", ["id"]),
        {
            urn: makeEndpointUrn("commerce", "claimEvidenceFile"),
            method: "GET",
            access: { mode: "admin", roles: ["support", "finance"] },
            targetUrl: "https://commerce.test/claim-evidence-file",
            responseKind: "file",
            mediaType: "application/octet-stream",
            input: { params: [{ name: "evidenceId", in: "query", schema: { type: "number" }, required: true }] },
            output: [{ status: "200" }],
        },
        command("resolveOrderClaim", {
            claimId: { type: "number" }, outcome: { type: "string" }, buyerRefundAmount: { type: "number" },
            sellerTransferAmount: { type: "number" }, protectionFeeRefundAmount: { type: "number" },
            decisionReason: { type: "string" }, expectedVersion: { type: "number" },
        }),
        query("refundRequests", ["status", "limit", "offset"]),
        query("refundRequest", ["id"]),
        command("reviewOrderRefund", {
            refundRequestId: { type: "number" }, decision: { type: "string" }, reason: { type: "string" }, expectedVersion: { type: "number" },
        }),
        {
            ...command("authorizePlatformPayoutLiabilityDecrease", {
                expectedLiabilityRevision: { type: "number" }, reason: { type: "string" },
            }),
            output: [{ status: "200", body: { type: "object", properties: {
                liabilityRevision: { type: "number" }, requiredMinimumAmount: { type: "number" },
                decreaseAuthorizationId: { type: "string", nullable: true }, changeDirection: { type: "string" },
            } } }],
        },
        {
            ...command("recordPlatformPayoutLiabilityApplied", {
                liabilityRevision: { type: "number" }, appliedMinimumAmount: { type: "number" },
                decreaseAuthorizationId: { type: "string", nullable: true },
            }),
            output: [{ status: "200", body: { type: "object", properties: {
                accepted: { type: "boolean" }, needsReapply: { type: "boolean" },
            } } }],
        },
        {
            ...command("pendingPlatformPayoutLiabilityAuthorizations", { runKey: { type: "string" } }),
            output: [{ status: "200", body: { type: "object", properties: {
                runKey: { type: "string" }, control: { type: "object" },
                authorizations: { type: "array", items: { type: "object", properties: {
                    liabilityRevision: { type: "number" }, requiredMinimumAmount: { type: "number" },
                    decreaseAuthorizationId: { type: "string", nullable: true }, changeDirection: { type: "string" },
                } } },
            } } }],
        },
        query("listCommerceExceptions", ["status", "limit", "offset"]),
        {
            ...command("processDueOrderDeadlines", { runKey: { type: "string" }, limit: { type: "number" } }),
            output: [{ status: "200", body: { type: "object", properties: {
                runKey: { type: "string" }, processed: { type: "number" },
                events: { type: "array", items: { type: "object" } },
            } } }],
        },
        {
            ...command("authorizeDueOrderReleases", { runKey: { type: "string" }, limit: { type: "number" } }),
            output: [{ status: "200", body: { type: "object", properties: {
                runKey: { type: "string" },
                authorizations: { type: "array", items: { type: "object", properties: {
                    status: { type: "string" }, releaseAuthorizationId: { type: "string" }, orderId: { type: "number" },
                    orderPublicId: { type: "string" }, paymentId: { type: "number" }, businessKey: { type: "string" },
                    releaseKind: { type: "string" },
                    sellerId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                    sellerRequiredMinimumBalanceAmount: { type: "number" }, payoutDelayDays: { type: "number" },
                    amount: { type: "number" }, currency: { type: "string" }, financialTermsHash: { type: "string" },
                } } },
            } } }],
        },
        {
            ...command("pendingPaymentCancellationAuthorizations", { runKey: { type: "string" }, limit: { type: "number" } }),
            output: [{ status: "200", body: { type: "object", properties: {
                runKey: { type: "string" },
                authorizations: { type: "array", items: { type: "object", properties: {
                    status: { type: "string" }, paymentCancellationRequestId: { type: "number" },
                    cancellationRequestId: { type: "string" }, orderId: { type: "number" },
                    orderPublicId: { type: "string" }, clientReferenceId: { type: "string" },
                    targetOrderStatus: { type: "string" }, reason: { type: "string" },
                    amount: { type: "number" }, currency: { type: "string" }, financialTermsHash: { type: "string" },
                } } },
            } } }],
        },
        {
            ...command("pendingOrderRefundAuthorizations", { runKey: { type: "string" }, limit: { type: "number" } }),
            output: [{ status: "200", body: { type: "object", properties: {
                runKey: { type: "string" },
                authorizations: { type: "array", items: { type: "object", properties: {
                    status: { type: "string" }, orderId: { type: "number" }, orderPublicId: { type: "string" },
                    providerPaymentId: { type: "number" }, refundRequestId: { type: "string" },
                    commerceRefundRequestId: { type: "number" }, businessKey: { type: "string" }, amount: { type: "number" },
                    authorizedSellerAmount: { type: "number" }, sellerEntitlementReductionAmount: { type: "number" },
                    sellerRecoveryAmount: { type: "number" }, protectionFeeRefundAmount: { type: "number" },
                    currency: { type: "string" }, financialTermsHash: { type: "string" }, requiresFinanceApproval: { type: "boolean" },
                } } },
            } } }],
        },
        command("recordOrderStripeDispute", {
            orderPublicId: { type: "string" }, providerEventId: { type: "string" }, providerDisputeId: { type: "string" },
            status: { type: "string" }, reason: { type: "string" }, amount: { type: "number" }, currency: { type: "string" },
            openedAt: { type: "string" }, occurredAt: { type: "string" }, evidenceDueBy: { type: "string" },
            providerSnapshot: { type: "object" },
        }),
    ];
}

function stripeSource(): Source {
    const statusShape: DataShape = {
        type: "object",
        properties: {
            exists: { type: "boolean" },
            userId: { type: "string" },
            connected: { type: "boolean" },
            stripeAccountId: { type: "string" },
            stripeAccountApiVersion: { type: "string" },
            onboardingStatus: { type: "string" },
            payoutsEnabled: { type: "boolean" },
            riskStatus: { type: "string" },
            applicationControlledRecipient: { type: "boolean" },
            canAcceptHeldPayments: { type: "boolean" },
            canReceiveProtectedPayments: { type: "boolean" },
            payoutBankReady: { type: "boolean" },
            accountStatus: { type: "string" },
            termsStatus: { type: "string" },
            stripeTermsStatus: { type: "string" },
            marketplaceTermsStatus: { type: "string" },
            marketplaceTermsCurrentVersionAccepted: { type: "boolean" },
            marketplaceTermsVersion: { type: "string" },
            marketplaceTermsHash: { type: "string" },
            marketplaceTermsAcceptedAt: { type: "string" },
            enrollmentStatus: { type: "string" },
            stripeTransfersStatus: { type: "string" },
            bankAccountStatus: { type: "string" },
            bankPayoutsStatus: { type: "string" },
            detailsSubmitted: { type: "boolean" },
            chargesEnabled: { type: "boolean" },
            currentlyDue: { type: "array", items: { type: "string" } },
            eventuallyDue: { type: "array", items: { type: "string" } },
            pastDue: { type: "array", items: { type: "string" } },
            pendingVerification: { type: "array", items: { type: "string" } },
        },
        required: [
            "exists", "userId", "connected", "onboardingStatus", "payoutsEnabled",
            "applicationControlledRecipient", "canAcceptHeldPayments", "canReceiveProtectedPayments",
            "payoutBankReady", "accountStatus", "termsStatus", "stripeTermsStatus",
            "marketplaceTermsStatus", "marketplaceTermsCurrentVersionAccepted", "enrollmentStatus",
            "stripeTransfersStatus", "bankAccountStatus", "bankPayoutsStatus", "detailsSubmitted",
            "chargesEnabled", "currentlyDue", "eventuallyDue", "pastDue", "pendingVerification",
        ],
    };
    return {
        urn: makeSourceUrn("stripe-connect"),
        identityAuthority: "stripe-connect",
        endpoints: [
            {
                urn: makeEndpointUrn("stripe-connect", "getConnectStatus"),
                method: "GET",
                targetUrl: "https://stripe.test/status",
                headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
                input: { params: [
                    { name: "marketplaceTermsVersion", in: "query", schema: { type: "string" } },
                    { name: "marketplaceTermsHash", in: "query", schema: { type: "string" } },
                ] },
                output: [
                    { status: "200", body: statusShape },
                    { status: "400", body: { type: "object" } },
                    { status: "409", body: { type: "object" } },
                ],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "enrollConnectSeller"),
                method: "POST",
                targetUrl: "https://stripe.test/enrollment",
                headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
                input: { body: {
                    type: "object",
                    properties: {
                        accountToken: { type: "string" },
                        contactEmail: { type: "string" },
                        marketplaceTermsAccepted: { type: "boolean" },
                        marketplaceTermsVersion: { type: "string" },
                        marketplaceTermsHash: { type: "string" },
                    },
                } },
                output: [
                    { status: "200", body: statusShape },
                    { status: "400", body: { type: "object" } },
                    { status: "409", body: { type: "object" } },
                ],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "getConnectClientConfig"),
                method: "GET",
                targetUrl: "https://stripe.test/config",
                headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
                input: { params: [] },
                output: [{ status: "200", body: {
                    type: "object",
                    properties: { publishableKey: { type: "string" } },
                    required: ["publishableKey"],
                } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "checkSellerHeldPaymentEligibility"),
                method: "POST",
                access: { mode: "system" },
                targetUrl: "https://stripe.test/seller-eligibility",
                headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
                input: { body: {
                    type: "object",
                    properties: {
                        sellerUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                        marketplaceTermsVersion: { type: "string" },
                        marketplaceTermsHash: { type: "string" },
                    },
                    required: ["sellerUserId", "marketplaceTermsVersion", "marketplaceTermsHash"],
                } },
                output: [{ status: "200", body: { type: "object", properties: {
                    eligible: { type: "boolean" }, reasonCode: { type: "string" },
                }, required: ["eligible", "reasonCode"] } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "createProtectedPayment"),
                method: "POST",
                targetUrl: "https://stripe.test/payment",
                headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
                input: { body: {
                    type: "object",
                    properties: {
                        sellerUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                        amountTotal: { type: "number" },
                        sellerTransferAmount: { type: "number" },
                        currency: { type: "string" },
                        clientReferenceId: { type: "string" },
                        financialTermsHash: { type: "string" },
                        financialRevision: { type: "number" },
                        dualApprovalThresholdAmount: { type: "number" },
                        description: { type: "string" },
                    },
                    required: ["sellerUserId", "amountTotal", "sellerTransferAmount", "currency", "clientReferenceId", "financialTermsHash", "dualApprovalThresholdAmount"],
                } },
                output: [{ status: "200", body: {
                    type: "object",
                    properties: {
                        paymentId: { type: "number" },
                        stripePaymentIntentId: { type: "string" },
                        clientSecret: { type: "string" },
                        paymentStatus: { type: "string" },
                        commercePaymentStatus: { type: "string" },
                        settlementStatus: { type: "string" }, disputeStatus: { type: "string" },
                        refundedAmount: { type: "number" }, clientReferenceId: { type: "string" },
                        stripeChargeId: { type: "string" },
                        stripeChargeBalanceTransactionId: { type: "string" },
                        manualReviewReason: { type: "string" },
                        amountTotal: { type: "number" },
                        sellerTransferAmount: { type: "number" }, platformRetainedAmount: { type: "number" },
                        transferredAmount: { type: "number" }, reversedAmount: { type: "number" },
                        currency: { type: "string" },
                        financialTermsHash: { type: "string" },
                        updatedAt: { type: "string" },
                    },
                } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "getProtectedPaymentByClientReference"),
                method: "GET",
                access: { mode: "system" },
                targetUrl: "https://stripe.test/payment-by-reference",
                headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
                input: { params: [{
                    name: "clientReferenceId",
                    in: "query",
                    schema: { type: "string" },
                }] },
                output: [{ status: "200", body: {
                    type: "object",
                    properties: {
                        exists: { type: "boolean" },
                        payment: {
                            type: "object",
                            properties: {
                                paymentId: { type: "number" },
                                stripePaymentIntentId: { type: "string" },
                                paymentStatus: { type: "string" },
                                commercePaymentStatus: { type: "string" },
                                settlementStatus: { type: "string" },
                                disputeStatus: { type: "string" },
                                reconciliationPending: { type: "boolean" },
                                refundedAmount: { type: "number" },
                                manualReviewReason: { type: "string" },
                                amountTotal: { type: "number" },
                                currency: { type: "string" },
                                financialTermsHash: { type: "string" },
                                stripeChargeId: { type: "string" },
                                buyerUserId: { type: "string" },
                                sellerUserId: { type: "string" },
                                platformRetainedAmount: { type: "number" },
                                actualPlatformMarginAfterStripeAmount: { type: "number" },
                                updatedAt: { type: "string" },
                            },
                        },
                    },
                    required: ["exists"],
                } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "configurePlatformPayoutControls"),
                method: "POST",
                targetUrl: "https://stripe.test/payout/platform",
                input: { body: { type: "object", properties: {
                    platformPayoutControlChangeId: { type: "string" }, minimumBalanceEur: { type: "number" },
                    liabilityRevision: { type: "number" }, decreaseAuthorizationId: { type: "string", nullable: true },
                    delayDaysOverride: { type: "number" }, debitNegativeBalances: { type: "boolean" }, reason: { type: "string" },
                } } },
                output: [{ status: "200", body: { type: "object", properties: {
                    liabilityRevision: { type: "number" }, appliedMinimumBalanceEur: { type: "number" },
                    decreaseAuthorizationId: { type: "string", nullable: true }, payoutControl: { type: "object" },
                } } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "configureSellerPayoutSchedule"),
                method: "POST",
                targetUrl: "https://stripe.test/payout/seller",
                input: { body: { type: "object", properties: {
                    userId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                    payoutScheduleChangeId: { type: "string" }, interval: { type: "string" },
                    weeklyPayoutDays: { type: "array", items: { type: "string" } }, minimumBalanceEur: { type: "number" },
                    delayDaysOverride: { type: "number" }, debitNegativeBalances: { type: "boolean" }, reason: { type: "string" },
                } } },
                output: [{ status: "200", body: { type: "object" } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "cancelProtectedPayment"),
                method: "POST",
                targetUrl: "https://stripe.test/payment/cancel",
                input: { body: { type: "object", properties: {
                    clientReferenceId: { type: "string" }, cancellationRequestId: { type: "string" }, reason: { type: "string" },
                } } },
                output: [{ status: "200", body: { type: "object", properties: {
                    cancellationRequestId: { type: "string" }, providerOperationId: { type: "number" }, providerStatus: { type: "string" },
                    providerPaymentAbsent: { type: "boolean" }, providerEventId: { type: "string" },
                    providerPaymentId: { type: "number" }, providerPaymentIntentId: { type: "string" },
                    providerChargeId: { type: "string" }, paymentStatus: { type: "string" }, amount: { type: "number" },
                    currency: { type: "string" }, financialTermsHash: { type: "string" }, occurredAt: { type: "string" },
                    providerSnapshot: { type: "object" },
                    payment: { type: "object", properties: {
                        paymentId: { type: "number" }, stripePaymentIntentId: { type: "string" }, stripeChargeId: { type: "string" },
                        clientReferenceId: { type: "string" }, paymentStatus: { type: "string" }, amountTotal: { type: "number" },
                        currency: { type: "string" }, financialTermsHash: { type: "string" }, updatedAt: { type: "string" },
                    } },
                } } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "runProviderReconciliation"),
                method: "POST",
                targetUrl: "https://stripe.test/reconciliation",
                input: { body: { type: "object", properties: { runKey: { type: "string" }, limit: { type: "number" } } } },
                output: [{ status: "200", body: { type: "object", properties: {
                    payments: { type: "array", items: { type: "object", properties: {
                        paymentId: { type: "number" }, clientReferenceId: { type: "string" }, paymentStatus: { type: "string" },
                        commercePaymentStatus: { type: "string" },
                        providerEventId: { type: "string" },
                        stripePaymentIntentId: { type: "string" },
                        amountTotal: { type: "number" }, currency: { type: "string" }, financialTermsHash: { type: "string" },
                        occurredAt: { type: "string" }, stripeChargeId: { type: "string" }, updatedAt: { type: "string" },
                        projectionId: { type: "number" }, projectionClaimToken: { type: "string" },
                    } } },
                    commerceOperations: { type: "array", items: { type: "object", properties: {
                        orderPublicId: { type: "string" }, providerOperationId: { type: "number" }, operationType: { type: "string" },
                        providerEventId: { type: "string" },
                        status: { type: "string" }, amount: { type: "number" }, currency: { type: "string" }, occurredAt: { type: "string" },
                        updatedAt: { type: "string" }, releaseAuthorizationId: { type: "string", nullable: true },
                        refundRequestId: { type: "string" },
                        commerceRefundRequestId: { type: "number" }, providerSnapshot: { type: "object" },
                        projectionId: { type: "number" }, projectionClaimToken: { type: "string" },
                    } } },
                    disputes: { type: "array", items: { type: "object", properties: {
                        id: { type: "string" }, clientReferenceId: { type: "string" }, status: { type: "string" },
                        providerEventId: { type: "string" },
                        reason: { type: "string" }, amount: { type: "number" }, currency: { type: "string" },
                        createdAt: { type: "string" }, updatedAt: { type: "string" }, evidenceDueBy: { type: "string" },
                        projectionId: { type: "number" }, projectionClaimToken: { type: "string" },
                    } } },
                } } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "acknowledgeCommerceProjection"),
                method: "POST",
                targetUrl: "https://stripe.test/reconciliation/projections/ack",
                input: { body: { type: "object", properties: {
                    projectionId: { type: "number" }, claimToken: { type: "string" },
                } } },
                output: [{ status: "200", body: { type: "object" } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "failCommerceProjection"),
                method: "POST",
                targetUrl: "https://stripe.test/reconciliation/projections/fail",
                input: { body: { type: "object", properties: {
                    projectionId: { type: "number" }, claimToken: { type: "string" }, error: { type: "string" },
                } } },
                output: [{ status: "200", body: { type: "object" } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "listStripeDisputes"),
                method: "GET",
                targetUrl: "https://stripe.test/disputes",
                input: { params: [{ name: "limit", in: "query", schema: { type: "number" } }] },
                output: [{ status: "200", body: { type: "object", properties: {
                    disputes: { type: "array", items: { type: "object", properties: {
                        id: { type: "string" }, clientReferenceId: { type: "string" }, status: { type: "string" },
                        reason: { type: "string" }, amount: { type: "number" }, currency: { type: "string" },
                        createdAt: { type: "string" }, updatedAt: { type: "string" }, evidenceDueBy: { type: "string" },
                    } } }, total: { type: "number" },
                } } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "requestSettlementRelease"),
                method: "POST",
                targetUrl: "https://stripe.test/settlement/release",
                input: { body: {
                    type: "object",
                    properties: {
                        paymentId: { type: "number" }, releaseAuthorizationId: { type: "string" },
                        releaseKind: { type: "string" },
                        amount: { type: "number" }, currency: { type: "string" },
                    },
                    required: ["paymentId", "releaseAuthorizationId", "releaseKind", "amount", "currency"],
                } },
                output: [{ status: "200", body: { type: "object", properties: {
                    providerOperationId: { type: "number" }, paymentId: { type: "number" }, releaseAuthorizationId: { type: "string" },
                    amount: { type: "number" }, currency: { type: "string" }, status: { type: "string" },
                    occurredAt: { type: "string" }, updatedAt: { type: "string" },
                } } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "requestProtectedRefund"),
                method: "POST",
                targetUrl: "https://stripe.test/refund/protected",
                input: { body: {
                    type: "object",
                    properties: {
                        paymentId: { type: "number" }, refundRequestId: { type: "string" }, amount: { type: "number" },
                        commerceRefundRequestId: { type: "number" }, authorizedSellerAmount: { type: "number" },
                        sellerEntitlementReductionAmount: { type: "number" }, reason: { type: "string" },
                    },
                    required: ["paymentId", "refundRequestId", "amount", "authorizedSellerAmount", "sellerEntitlementReductionAmount"],
                } },
                output: [{ status: "200", body: { type: "object", properties: {
                    payment: { type: "object" }, reversal: { type: "object", nullable: true }, refund: { type: "object" },
                    operations: { type: "array", items: { type: "object", properties: {
                        providerEventId: { type: "string" }, providerOperationId: { type: "number" },
                        operationType: { type: "string" }, providerOperationObjectId: { type: "string" }, status: { type: "string" },
                        amount: { type: "number" }, currency: { type: "string" }, occurredAt: { type: "string" },
                        refundRequestId: { type: "string" }, providerSnapshot: { type: "object" },
                    } } },
                } } }],
            },
            {
                urn: makeEndpointUrn("stripe-connect", "cancelProtectedPayment"),
                method: "POST",
                targetUrl: "https://stripe.test/payment/cancel",
                input: { body: { type: "object", properties: {
                    clientReferenceId: { type: "string" }, cancellationRequestId: { type: "string" }, reason: { type: "string" },
                } } },
                output: [{ status: "200", body: { type: "object", properties: {
                    cancellationRequestId: { type: "string" }, providerOperationId: { type: "number" }, providerStatus: { type: "string" },
                    providerPaymentAbsent: { type: "boolean" }, providerEventId: { type: "string" },
                    providerPaymentId: { type: "number" }, providerPaymentIntentId: { type: "string" },
                    providerChargeId: { type: "string" }, paymentStatus: { type: "string" }, amount: { type: "number" },
                    currency: { type: "string" }, financialTermsHash: { type: "string" }, occurredAt: { type: "string" },
                    providerSnapshot: { type: "object" },
                    payment: { type: "object", properties: {
                        paymentId: { type: "number" }, stripePaymentIntentId: { type: "string" },
                        stripeChargeId: { type: "string" }, paymentStatus: { type: "string" },
                        amountTotal: { type: "number" }, currency: { type: "string" },
                        financialTermsHash: { type: "string" }, updatedAt: { type: "string" },
                    } },
                } } }],
            },
        ],
    };
}

async function seedInstallation(
    installations: InMemoryIntegrationInstallationRepository,
    id: "commerce" | "stripe-connect",
): Promise<void> {
    await installations.create({
        id,
        label: id,
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: { id },
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: `urn:${id}`, action: "created" }],
        runs: [],
    });
}
