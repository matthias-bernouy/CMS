import { expect } from "bun:test";
import { validateFunction } from "@bernouy/cms-functions";
import { makeEndpointUrn } from "@bernouy/cms-sources";
import type { IntegrationContractContext } from "./harness";

export async function assertArtifactContracts({
    fn,
    legalFn,
    enrollmentFn,
    sources,
    result,
    platformDecreaseFn,
    submitPriceFn,
    protectedOrderFn,
    configFn,
    statusFn,
    refundFn,
    releaseFn,
    cancellationFn,
    refreshFn,
    deadlineWorker,
    cancellationWorker,
    releaseWorker,
    refundWorker,
    reconciliationWorker,
}: IntegrationContractContext): Promise<void> {
    expect(fn.access).toEqual({ mode: "auth" });
    const buyerLegalBrowserInputs = JSON.stringify({
        requirements: legalFn.input,
        payment: fn.input,
    });
    expect(buyerLegalBrowserInputs).toContain("acceptedLegalDocumentVersionIds");
    expect(buyerLegalBrowserInputs).not.toContain("contentHash");
    expect(buyerLegalBrowserInputs).not.toContain("acceptedAt");
    expect(buyerLegalBrowserInputs).not.toContain("buyerCmsUserId");
    expect(enrollmentFn.output?.[0]?.body?.properties?.connect?.properties?.stripeAccountId).toEqual({
        type: "string",
        nullable: true,
    });
    expect((await sources.getEndpoint(makeEndpointUrn("commerce", "prepareProtectedPayment")))?.access).toEqual({
        mode: "system",
    });
    expect(result.artifacts).toEqual([
        { type: "function", id: enrollmentFn.id, action: "created" },
        { type: "function", id: platformDecreaseFn.id, action: "created" },
        { type: "function", id: submitPriceFn.id, action: "created" },
        { type: "function", id: protectedOrderFn.id, action: "created" },
        { type: "function", id: "getStripePaymentClientConfig", action: "created" },
        { type: "function", id: legalFn.id, action: "created" },
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
        { type: "trigger", id: "schedule-reconcile-protected-payment-systems", action: "created" },
        { type: "trigger", id: "schedule-process-due-order-deadlines", action: "created" },
        { type: "trigger", id: "schedule-dispatch-pending-payment-cancellations", action: "created" },
        { type: "trigger", id: "schedule-dispatch-pending-protected-refunds", action: "created" },
        { type: "trigger", id: "schedule-dispatch-due-protected-settlements", action: "created" },
        { type: "dashboard-view", id: "commerce-stripe-payments-operations", action: "created" },
        { type: "dashboard", id: "commerce-stripe-payments", action: "created" },
        { type: "bloc", id: "commerce-stripe-payment", action: "created" },
    ]);
    expect(await validateFunction(fn, { sources })).toEqual([]);
    expect(await validateFunction(legalFn, { sources })).toEqual([]);
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
}
