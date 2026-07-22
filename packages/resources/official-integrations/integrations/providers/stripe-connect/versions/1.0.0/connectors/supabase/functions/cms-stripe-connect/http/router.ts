import { assertStripeKeyModeCoherence } from "../shared/runtime.ts";
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

type RouteDefinition = readonly [method: "GET" | "POST", handler: keyof StripeConnectRouteHandlers];

const webhookRoutes: Readonly<Record<string, RouteDefinition>> = {
    "/webhooks/stripe": ["POST", "ingestPlatformWebhook"],
    "/webhooks/stripe-connect": ["POST", "ingestConnectWebhook"],
    "/webhooks/stripe-connect-v2": ["POST", "ingestConnectV2Webhook"],
};

const routes: Readonly<Record<string, RouteDefinition>> = {
    "/health": ["GET", "health"],
    "/connect/config": ["GET", "connectConfig"],
    "/connect/status": ["GET", "connectStatus"],
    "/connect/wallet": ["GET", "connectWallet"],
    "/connect/enrollment": ["POST", "connectEnrollment"],
    "/connect/verification": ["POST", "connectVerification"],
    "/connect/onboarding": ["POST", "connectOnboarding"],
    "/connect/onboarding/session": ["POST", "connectOnboardingSession"],
    "/payments/seller-eligibility": ["POST", "checkSellerHeldPaymentEligibility"],
    "/payments/protected": ["POST", "createProtectedPayment"],
    "/payments/payment": ["GET", "getProtectedPayment"],
    "/payments/reference": ["GET", "getProtectedPaymentByReference"],
    "/operations/payment-cancellation": ["POST", "requestPaymentIntentCancellation"],
    "/operations/release": ["POST", "requestSettlementRelease"],
    "/operations/reversal": ["POST", "requestTransferReversal"],
    "/operations/protected-refund": ["POST", "requestProtectedRefund"],
    "/reconciliation/payment": ["POST", "reconcileProviderPayment"],
    "/reconciliation/run": ["POST", "runProviderReconciliation"],
    "/reconciliation/projections/ack": ["POST", "acknowledgeCommerceProjection"],
    "/reconciliation/projections/fail": ["POST", "failCommerceProjection"],
    "/admin/platform/payout-protection": ["POST", "configurePlatformPayoutProtection"],
    "/admin/accounts/account/risk": ["GET", "getSellerProviderRisk"],
    "/admin/accounts/account/payout-schedule": ["POST", "configureSellerPayoutSchedule"],
    "/admin/accounts/account/onboarding": ["POST", "adminCreateOnboarding"],
    "/admin/accounts/account/onboarding/session": ["POST", "adminCreateOnboardingSession"],
    "/admin/payments": ["GET", "listProviderPayments"],
    "/admin/payments/payment": ["GET", "getProviderPayment"],
    "/admin/refunds": ["GET", "listProviderRefunds"],
    "/admin/refunds/refund": ["GET", "getProviderRefund"],
    "/admin/disputes": ["GET", "listStripeDisputes"],
    "/admin/disputes/dispute": ["GET", "getStripeDispute"],
    "/admin/disputes/files": ["POST", "uploadStripeDisputeFile"],
    "/admin/disputes/evidence/stage": ["POST", "stageStripeDisputeEvidence"],
    "/admin/disputes/evidence/submit": ["POST", "submitStripeDisputeEvidence"],
    "/admin/disputes/accept": ["POST", "acceptStripeDispute"],
    "/admin/exceptions": ["GET", "listProviderExceptions"],
    "/admin/exceptions/exception": ["GET", "getProviderException"],
    "/admin/commerce-projections/requeue": ["POST", "requeueCommerceProjection"],
    "/admin/operations": ["GET", "listFinancialOperations"],
};

export function serveStripeConnect(handlers: StripeConnectRouteHandlers): void {
    Deno.serve(async (request) => {
        try {
            assertStripeKeyModeCoherence();
            const route = routePath(request);
            const webhook = webhookRoutes[route];
            if (webhook) {
                return await dispatchRoute(handlers, request, webhook);
            }
            if (request.method === "OPTIONS") {
                return optionsResponse();
            }

            const definition = routes[route];
            if (definition) {
                return await dispatchRoute(handlers, request, definition);
            }

            return json({ error: "not found" }, 404);
        } catch (error) {
            return handleError(error);
        }
    });
}

async function dispatchRoute(
    handlers: StripeConnectRouteHandlers,
    request: Request,
    [method, handler]: RouteDefinition,
): Promise<Response> {
    return await withMethod(request, method, () => handlers[handler](request));
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-stripe-connect";
    const index = pathname.indexOf(marker);
    if (index === -1) {
        return pathname || "/";
    }
    return pathname.slice(index + marker.length) || "/";
}
