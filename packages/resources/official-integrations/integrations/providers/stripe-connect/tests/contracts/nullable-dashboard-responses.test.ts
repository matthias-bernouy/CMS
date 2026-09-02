import { describe, expect, test } from "bun:test";
import { projectEndpointResponse, type SourceEndpoint } from "@bernouy/cms-sources";
import { loadIntegrationDefinition } from "../../../../../tests/helpers/integrationDefinition";

type DefinitionEndpoint = Pick<SourceEndpoint, "method" | "targetUrl" | "output"> & {
    endpointId: string;
};

const definitionUrl = new URL("../../definition.json", import.meta.url);

describe("stripe-connect nullable dashboard response contracts", () => {
    test("preserves provider exceptions without linked payments or operations", async () => {
        const exception = {
            id: 1,
            deduplication_key: null,
            payment_id: null,
            operation_id: null,
            exception_type: "provider_payment_truth_mismatch",
            severity: "critical",
            status: "open",
            message: "Provider state requires review",
            details: {},
            detected_at: "2026-07-23T11:00:00.000Z",
            resolved_at: null,
            resolved_by: null,
        };

        expect(await projectedBody("listProviderExceptions", { exceptions: [exception], total: 1 })).toEqual({
            exceptions: [exception],
            total: 1,
        });
        expect(await projectedBody("getProviderException", exception)).toEqual(exception);
    });

    test("preserves unclaimed and incomplete financial operations", async () => {
        const operation = {
            providerOperationId: 1,
            paymentId: null,
            providerPaymentId: null,
            clientReferenceId: null,
            businessKey: "provider-reconcile:1",
            operationType: "provider_reconcile",
            status: "reserved",
            amount: 0,
            currency: "eur",
            releaseAuthorizationId: null,
            refundRequestId: null,
            commerceRefundRequestId: null,
            stripeObjectId: null,
            request: {},
            response: null,
            lastError: null,
            attemptCount: 0,
            nextAttemptAt: null,
            claimedAt: null,
            completedAt: null,
            providerEventId: "operation:1:reserved",
            occurredAt: "2026-07-23T11:00:00.000Z",
            createdAt: "2026-07-23T11:00:00.000Z",
            updatedAt: "2026-07-23T11:00:00.000Z",
        };

        expect(await projectedBody("listFinancialOperations", { operations: [operation], total: 1 })).toEqual({
            operations: [operation],
            total: 1,
        });
    });

    test("preserves provider payments before optional provider state exists", async () => {
        const payment = {
            paymentId: 1,
            providerPaymentId: 1,
            clientReferenceId: "order-1",
            financialTermsHash: "terms-1",
            financialRevision: 1,
            buyerUserId: "buyer-1",
            sellerUserId: "seller-1",
            stripePaymentIntentId: null,
            stripeChargeId: null,
            providerEventId: null,
            transferGroup: "order-1",
            currency: "eur",
            amountTotal: 1000,
            sellerTransferAmount: 800,
            platformRetainedAmount: 200,
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
            actualPlatformMarginAfterStripeAmount: 200,
            paymentStatus: "reserved",
            commercePaymentStatus: "reserved",
            settlementStatus: "pending",
            disputeStatus: "none",
            reconciliationPending: false,
            manualReviewReason: null,
            description: null,
            paidAt: null,
            cancelledAt: null,
            lastProviderSyncAt: null,
            occurredAt: "2026-07-23T11:00:00.000Z",
            createdAt: "2026-07-23T11:00:00.000Z",
            updatedAt: "2026-07-23T11:00:00.000Z",
        };

        expect(await projectedBody("getProviderPayment", payment)).toMatchObject({
            providerEventId: null,
            manualReviewReason: null,
            cancelledAt: null,
        });
        expect(await projectedBody("listProviderPayments", { payments: [payment], total: 1 })).toMatchObject({
            payments: [{ stripePaymentIntentId: null, lastProviderSyncAt: null }],
            total: 1,
        });
        expect(await projectedBody("getProtectedPayment", payment)).toMatchObject({
            stripePaymentIntentId: null,
            lastProviderSyncAt: null,
        });
        expect(await projectedBody("getProtectedPaymentByClientReference", { exists: true, payment })).toMatchObject({
            exists: true,
            payment: { stripePaymentIntentId: null, lastProviderSyncAt: null },
        });
    });
});

async function projectedBody(endpointId: string, payload: unknown): Promise<unknown> {
    const endpoint = await definitionEndpoint(endpointId);
    const response = await projectEndpointResponse(
        endpoint,
        new Request("https://cms.test/source", { method: endpoint.method }),
        Response.json(payload),
    );
    expect(response.status, endpointId).toBe(200);
    return await response.json();
}

async function definitionEndpoint(endpointId: string): Promise<SourceEndpoint> {
    const definition = await loadIntegrationDefinition<{
        artifacts: Array<{ source?: { endpoints: DefinitionEndpoint[] } }>;
    }>(definitionUrl);
    const endpoint = definition.artifacts
        .find((artifact) => artifact.source)
        ?.source?.endpoints.find((candidate) => candidate.endpointId === endpointId);
    if (!endpoint) {
        throw new Error(`Missing Stripe Connect endpoint ${endpointId}`);
    }
    return { ...endpoint, urn: `urn:stripe-connect:${endpointId}` };
}
