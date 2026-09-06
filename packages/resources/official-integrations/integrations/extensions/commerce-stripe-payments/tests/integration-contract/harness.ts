import { expect } from "bun:test";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { importIntegration, InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { commerceSource, seedInstallation, stripeSource } from "./sources/index";

export const SELLER_TERMS_VERSION = "seller-terms-2026-07-13";
export const SELLER_TERMS_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const resolveCmsApiKey = async () => "commerce-cms-api-key";

export async function loadIntegrationContract(sellerPayoutSchedule = "daily") {
    const sources = new InMemorySourceRepository();
    const functions = new InMemoryFunctionRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    const roles = new InMemoryRolesRepository();
    const triggers = new InMemoryTriggerRepository();
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    await sources.createSource(commerceSource());
    await sources.createSource(stripeSource());
    await seedInstallation(installations, "commerce");
    await seedInstallation(installations, "stripe-connect");
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
        "commerce-stripe-payments",
    );
    if (!definition) {
        throw new Error("commerce-stripe-payments definition not found");
    }
    expect(JSON.stringify(definition.artifacts?.filter((artifact) => artifact.type === "function"))).not.toContain(
        "debitNegativeBalances",
    );
    const result = await importIntegration(
        {
            sources,
            functions,
            installations,
            roles,
            triggers,
            dashboards,
            dashboardViews,
        },
        {
            kind: "commerce-stripe-payments",
            answers: {},
            options: {},
        },
        [definition],
    );
    const fn = await functions.getFunction("createPaymentForOrder");
    const legalFn = await functions.getFunction("getPaymentLegalRequirements");
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
    const capabilityRefreshFn = await functions.getFunction("refreshMyProtectedPaymentCapability");
    const platformDecreaseFn = await functions.getFunction("applyPlatformPayoutLiabilityDecrease");
    const submitPriceFn = await functions.getFunction("submitSellerOfferPrice");
    const protectedOrderFn = await functions.getFunction("createProtectedOrder");
    if (!fn) {
        throw new Error("createPaymentForOrder function not imported");
    }
    if (!legalFn) {
        throw new Error("getPaymentLegalRequirements function not imported");
    }
    if (!configFn) {
        throw new Error("getStripePaymentClientConfig function not imported");
    }
    if (!statusFn) {
        throw new Error("getPaymentForOrder function not imported");
    }
    if (!refreshFn) {
        throw new Error("refreshPaymentForOrder function not imported");
    }
    if (!releaseFn) {
        throw new Error("executeAuthorizedSettlementRelease function not imported");
    }
    if (
        !refundFn ||
        !cancellationFn ||
        !deadlineWorker ||
        !cancellationWorker ||
        !releaseWorker ||
        !refundWorker ||
        !reconciliationWorker
    ) {
        throw new Error("protected financial workers not imported");
    }
    if (!enrollmentFn || !capabilityRefreshFn || !platformDecreaseFn || !submitPriceFn || !protectedOrderFn) {
        throw new Error("seller sale enrollment functions not imported");
    }
    return {
        sources,
        roles,
        triggers,
        dashboards,
        dashboardViews,
        result,
        fn,
        legalFn,
        configFn,
        statusFn,
        refreshFn,
        releaseFn,
        refundFn,
        cancellationFn,
        deadlineWorker,
        cancellationWorker,
        releaseWorker,
        refundWorker,
        reconciliationWorker,
        enrollmentFn,
        capabilityRefreshFn,
        platformDecreaseFn,
        submitPriceFn,
        protectedOrderFn,
        sellerPayoutSchedule,
    };
}

export type IntegrationContractContext = Awaited<ReturnType<typeof loadIntegrationContract>>;
