import { connectEnrollment, connectVerification } from "../routes/accounts/enrollment.ts";
import { configureMarketplaceTerms } from "../routes/accounts/marketplace-terms/configuration.ts";
import {
    adminCreateOnboarding,
    adminCreateOnboardingSession,
    connectOnboarding,
    connectOnboardingSession,
} from "../routes/accounts/onboarding.ts";
import { connectStatus, connectWallet, getSellerProviderRisk } from "../routes/accounts/status.ts";
import {
    getProviderException,
    listFinancialOperations,
    listProviderExceptions,
    requeueCommerceProjection,
} from "../routes/admin/dashboard.ts";
import { getStripeDispute, listStripeDisputes } from "../routes/disputes/dashboard.ts";
import { requestPaymentIntentCancellation } from "../routes/payments/cancellation.ts";
import { getProviderPayment, listProviderPayments } from "../routes/payments/dashboard.ts";
import { acknowledgeCommerceProjection, failCommerceProjection } from "../routes/reconciliation/projections.ts";
import { getProviderRefund, listProviderRefunds } from "../routes/refunds/dashboard.ts";
import { connectConfig, health } from "../routes/system.ts";
import type { StripeConnectRouteHandlers } from "./router.ts";

export const directStripeConnectHandlers = {
    health,
    connectConfig,
    connectStatus,
    connectWallet,
    connectEnrollment,
    connectVerification,
    configureMarketplaceTerms,
    connectOnboarding,
    connectOnboardingSession,
    requestPaymentIntentCancellation,
    acknowledgeCommerceProjection,
    failCommerceProjection,
    getSellerProviderRisk,
    adminCreateOnboarding,
    adminCreateOnboardingSession,
    listProviderPayments,
    getProviderPayment,
    listProviderRefunds,
    getProviderRefund,
    listStripeDisputes,
    getStripeDispute,
    listProviderExceptions,
    getProviderException,
    requeueCommerceProjection,
    listFinancialOperations,
} satisfies Partial<StripeConnectRouteHandlers>;
