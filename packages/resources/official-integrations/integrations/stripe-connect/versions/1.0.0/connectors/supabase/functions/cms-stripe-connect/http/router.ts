import { assertStripeKeyModeCoherence } from "../config/runtime.ts";
import { handleError, json, optionsResponse, withMethod } from "./responses.ts";

type RouteHandler = (request: Request) => Promise<Response>;

export type StripeConnectRouteHandlers = {
    ingestPlatformWebhook: RouteHandler;
    ingestConnectWebhook: RouteHandler;
    ingestConnectV2Webhook: RouteHandler;
    health: RouteHandler;
    connectConfig: RouteHandler;
    connectStatus: RouteHandler;
    connectWallet: RouteHandler;
    connectEnrollment: RouteHandler;
    connectVerification: RouteHandler;
    connectOnboarding: RouteHandler;
    connectOnboardingSession: RouteHandler;
    checkSellerHeldPaymentEligibility: RouteHandler;
    createProtectedPayment: RouteHandler;
    getProtectedPayment: RouteHandler;
    getProtectedPaymentByReference: RouteHandler;
    requestPaymentIntentCancellation: RouteHandler;
    requestSettlementRelease: RouteHandler;
    requestTransferReversal: RouteHandler;
    requestProtectedRefund: RouteHandler;
    reconcileProviderPayment: RouteHandler;
    runProviderReconciliation: RouteHandler;
    acknowledgeCommerceProjection: RouteHandler;
    failCommerceProjection: RouteHandler;
    configurePlatformPayoutProtection: RouteHandler;
    getSellerProviderRisk: RouteHandler;
    configureSellerPayoutSchedule: RouteHandler;
    adminCreateOnboarding: RouteHandler;
    adminCreateOnboardingSession: RouteHandler;
    listProviderPayments: RouteHandler;
    getProviderPayment: RouteHandler;
    listProviderRefunds: RouteHandler;
    getProviderRefund: RouteHandler;
    listStripeDisputes: RouteHandler;
    getStripeDispute: RouteHandler;
    uploadStripeDisputeFile: RouteHandler;
    stageStripeDisputeEvidence: RouteHandler;
    submitStripeDisputeEvidence: RouteHandler;
    acceptStripeDispute: RouteHandler;
    listProviderExceptions: RouteHandler;
    getProviderException: RouteHandler;
    requeueCommerceProjection: RouteHandler;
    listFinancialOperations: RouteHandler;
};

export function serveStripeConnect(handlers: StripeConnectRouteHandlers): void {
    Deno.serve(async (request) => {
        try {
            assertStripeKeyModeCoherence();
            const route = routePath(request);
            if (route === "/webhooks/stripe") {
                return await withMethod(request, "POST", () => handlers.ingestPlatformWebhook(request));
            }
            if (route === "/webhooks/stripe-connect") {
                return await withMethod(request, "POST", () => handlers.ingestConnectWebhook(request));
            }
            if (route === "/webhooks/stripe-connect-v2") {
                return await withMethod(request, "POST", () => handlers.ingestConnectV2Webhook(request));
            }
            if (request.method === "OPTIONS") return optionsResponse();

            if (route === "/health") return await withMethod(request, "GET", () => handlers.health(request));
            if (route === "/connect/config") return await withMethod(request, "GET", () => handlers.connectConfig(request));
            if (route === "/connect/status") return await withMethod(request, "GET", () => handlers.connectStatus(request));
            if (route === "/connect/wallet") return await withMethod(request, "GET", () => handlers.connectWallet(request));
            if (route === "/connect/enrollment") return await withMethod(request, "POST", () => handlers.connectEnrollment(request));
            if (route === "/connect/verification") return await withMethod(request, "POST", () => handlers.connectVerification(request));
            if (route === "/connect/onboarding") return await withMethod(request, "POST", () => handlers.connectOnboarding(request));
            if (route === "/connect/onboarding/session") return await withMethod(request, "POST", () => handlers.connectOnboardingSession(request));
            if (route === "/payments/seller-eligibility") return await withMethod(request, "POST", () => handlers.checkSellerHeldPaymentEligibility(request));
            if (route === "/payments/protected") return await withMethod(request, "POST", () => handlers.createProtectedPayment(request));
            if (route === "/payments/payment") return await withMethod(request, "GET", () => handlers.getProtectedPayment(request));
            if (route === "/payments/reference") return await withMethod(request, "GET", () => handlers.getProtectedPaymentByReference(request));
            if (route === "/operations/payment-cancellation") return await withMethod(request, "POST", () => handlers.requestPaymentIntentCancellation(request));
            if (route === "/operations/release") return await withMethod(request, "POST", () => handlers.requestSettlementRelease(request));
            if (route === "/operations/reversal") return await withMethod(request, "POST", () => handlers.requestTransferReversal(request));
            if (route === "/operations/protected-refund") return await withMethod(request, "POST", () => handlers.requestProtectedRefund(request));
            if (route === "/reconciliation/payment") return await withMethod(request, "POST", () => handlers.reconcileProviderPayment(request));
            if (route === "/reconciliation/run") return await withMethod(request, "POST", () => handlers.runProviderReconciliation(request));
            if (route === "/reconciliation/projections/ack") return await withMethod(request, "POST", () => handlers.acknowledgeCommerceProjection(request));
            if (route === "/reconciliation/projections/fail") return await withMethod(request, "POST", () => handlers.failCommerceProjection(request));
            if (route === "/admin/platform/payout-protection") return await withMethod(request, "POST", () => handlers.configurePlatformPayoutProtection(request));
            if (route === "/admin/accounts/account/risk") return await withMethod(request, "GET", () => handlers.getSellerProviderRisk(request));
            if (route === "/admin/accounts/account/payout-schedule") return await withMethod(request, "POST", () => handlers.configureSellerPayoutSchedule(request));
            if (route === "/admin/accounts/account/onboarding") return await withMethod(request, "POST", () => handlers.adminCreateOnboarding(request));
            if (route === "/admin/accounts/account/onboarding/session") return await withMethod(request, "POST", () => handlers.adminCreateOnboardingSession(request));
            if (route === "/admin/payments") return await withMethod(request, "GET", () => handlers.listProviderPayments(request));
            if (route === "/admin/payments/payment") return await withMethod(request, "GET", () => handlers.getProviderPayment(request));
            if (route === "/admin/refunds") return await withMethod(request, "GET", () => handlers.listProviderRefunds(request));
            if (route === "/admin/refunds/refund") return await withMethod(request, "GET", () => handlers.getProviderRefund(request));
            if (route === "/admin/disputes") return await withMethod(request, "GET", () => handlers.listStripeDisputes(request));
            if (route === "/admin/disputes/dispute") return await withMethod(request, "GET", () => handlers.getStripeDispute(request));
            if (route === "/admin/disputes/files") return await withMethod(request, "POST", () => handlers.uploadStripeDisputeFile(request));
            if (route === "/admin/disputes/evidence/stage") return await withMethod(request, "POST", () => handlers.stageStripeDisputeEvidence(request));
            if (route === "/admin/disputes/evidence/submit") return await withMethod(request, "POST", () => handlers.submitStripeDisputeEvidence(request));
            if (route === "/admin/disputes/accept") return await withMethod(request, "POST", () => handlers.acceptStripeDispute(request));
            if (route === "/admin/exceptions") return await withMethod(request, "GET", () => handlers.listProviderExceptions(request));
            if (route === "/admin/exceptions/exception") return await withMethod(request, "GET", () => handlers.getProviderException(request));
            if (route === "/admin/commerce-projections/requeue") return await withMethod(request, "POST", () => handlers.requeueCommerceProjection(request));
            if (route === "/admin/operations") return await withMethod(request, "GET", () => handlers.listFinancialOperations(request));

            return json({ error: "not found" }, 404);
        } catch (error) {
            return handleError(error);
        }
    });
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-stripe-connect";
    const index = pathname.indexOf(marker);
    if (index === -1) return pathname || "/";
    return pathname.slice(index + marker.length) || "/";
}
