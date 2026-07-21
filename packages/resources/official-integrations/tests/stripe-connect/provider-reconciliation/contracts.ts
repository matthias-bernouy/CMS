import { describe, expect, test } from "bun:test";
import {
    createTerminalPageFixture,
    successfulJson,
    type CreateProviderReconciliationHarness,
    type JsonRecord,
} from "./harness";

const createdAt = "2026-07-21T09:00:00.000Z";
const updatedAt = "2026-07-21T09:05:00.000Z";

export function registerProviderReconciliationContracts(
    createHarness: CreateProviderReconciliationHarness,
): void {
    describe("stripe-connect provider reconciliation response contracts", () => {
        test("hydrates one terminal pending page without changing its public DTOs", async () => {
            const fixture = await createTerminalPageFixture(createHarness, "terminal-page-contract");
            const body = await successfulJson(await fixture.run(fixture.seed.runKey, 10));
            const seed = fixture.seed;

            expect(body).toEqual({
                runId: seed.runId,
                runKey: seed.runKey,
                status: "succeeded",
                scannedCount: 3,
                repairedCount: 2,
                exceptionCount: 0,
                details: { fixture: "terminal-provider-reconciliation" },
                startedAt: createdAt,
                finishedAt: updatedAt,
                payments: [{
                    paymentId: seed.paymentId, providerPaymentId: seed.paymentId,
                    clientReferenceId: "terminal-reconciliation-order",
                    financialTermsHash: "a".repeat(64), financialRevision: 1,
                    buyerUserId: "buyer-terminal-reconciliation-order",
                    sellerUserId: "seller-terminal-reconciliation-order",
                    stripePaymentIntentId: "pi_terminal_reconciliation",
                    stripeChargeId: "ch_terminal_reconciliation",
                    stripeChargeBalanceTransactionId: "txn_terminal_reconciliation",
                    providerEventId: seed.paymentProjectionKey,
                    transferGroup: "group_terminal-reconciliation-order", currency: "eur",
                    amountTotal: 1200, sellerTransferAmount: 1080, platformRetainedAmount: 120,
                    refundedAmount: 0, transferredAmount: 1080, reversedAmount: 0,
                    actualStripeChargeFeeAmount: 65, actualStripeRefundFeeAmount: 0,
                    actualStripeProcessingFeeAmount: 65, actualStripeChargeNetAmount: 1135,
                    actualStripeFeeCurrency: "eur",
                    actualStripeChargeFeeDetails: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
                    actualPlatformMarginAfterStripeAmount: 55,
                    paymentStatus: "succeeded", commercePaymentStatus: "succeeded",
                    settlementStatus: "released", disputeStatus: "open",
                    manualReviewReason: null,
                    description: "Terminal reconciliation fixture", paidAt: createdAt,
                    cancelledAt: null, lastProviderSyncAt: updatedAt,
                    occurredAt: updatedAt, createdAt, updatedAt,
                    projectionId: seed.paymentProjectionId,
                    projectionClaimToken: `claim-${seed.paymentProjectionId}-1`,
                    projectionAttemptCount: 1, causalSequence: 10,
                }],
                operations: [{
                    providerOperationId: seed.operationId, paymentId: seed.paymentId,
                    providerPaymentId: seed.paymentId,
                    clientReferenceId: "terminal-reconciliation-order",
                    businessKey: "transfer:terminal-reconciliation", operationType: "transfer_create",
                    status: "succeeded", amount: 1080, currency: "eur",
                    releaseAuthorizationId: "release-terminal-reconciliation",
                    refundRequestId: null, commerceRefundRequestId: null,
                    stripeObjectId: "tr_terminal_reconciliation",
                    request: {
                        amount: 1080, currency: "eur",
                        releaseAuthorizationId: "release-terminal-reconciliation",
                    },
                    response: { id: "tr_terminal_reconciliation", status: "succeeded" },
                    lastError: null, attemptCount: 1, nextAttemptAt: null,
                    claimedAt: createdAt, completedAt: updatedAt,
                    providerEventId: `operation:${seed.operationId}:succeeded`,
                    occurredAt: updatedAt, createdAt, updatedAt,
                }],
                commerceOperations: [{
                    orderPublicId: "terminal-reconciliation-order",
                    paymentId: seed.paymentId, providerPaymentId: seed.paymentId,
                    providerOperationId: seed.operationId,
                    providerEventId: seed.operationProjectionKey,
                    operationType: "transfer", status: "succeeded", amount: 1080,
                    currency: "eur", releaseAuthorizationId: "release-terminal-reconciliation",
                    providerSnapshot: { id: "tr_terminal_reconciliation", status: "succeeded" },
                    occurredAt: updatedAt, createdAt, updatedAt,
                    projectionId: seed.operationProjectionId,
                    projectionClaimToken: `claim-${seed.operationProjectionId}-1`,
                    projectionAttemptCount: 1, recoveryKey: null, causalSequence: 20,
                }],
                disputes: [{
                    id: "dp_terminal_reconciliation", paymentId: seed.paymentId,
                    stripeChargeId: "ch_terminal_reconciliation", amount: 1200,
                    currency: "eur", reason: "fraudulent", status: "needs_response",
                    evidenceStatus: "staged", evidenceDueBy: "2026-07-28T09:00:00.000Z",
                    isChargeRefundable: false, fundsWithdrawn: true,
                    balanceTransactionIds: ["txn_dispute_terminal_reconciliation"],
                    createdAt, updatedAt, providerPaymentId: seed.paymentId,
                    clientReferenceId: "terminal-reconciliation-order",
                    stagedEvidenceOperationId: "evidence-terminal-reconciliation",
                    stagedEvidenceAt: createdAt, evidenceSubmissionCount: 1,
                    providerEventId: seed.disputeProjectionKey,
                    projectionId: seed.disputeProjectionId,
                    projectionClaimToken: `claim-${seed.disputeProjectionId}-1`,
                    projectionAttemptCount: 1, causalSequence: 30,
                }],
            });
            expect(fixture.rest.stripeRequests).toEqual([]);
        });

        test("keeps terminal replays dynamic while paging projection leases", async () => {
            const fixture = await createTerminalPageFixture(createHarness, "terminal-page-replay");

            const first = await successfulJson(await fixture.run(fixture.seed.runKey, 2));
            expect(first).toMatchObject({
                runId: fixture.seed.runId,
                runKey: fixture.seed.runKey,
                status: "succeeded",
            });
            expect((first.payments as JsonRecord[]).map(row => row.providerEventId)).toEqual([
                fixture.seed.paymentProjectionKey,
            ]);
            expect((first.commerceOperations as JsonRecord[]).map(row => row.providerEventId)).toEqual([
                fixture.seed.operationProjectionKey,
            ]);
            expect(first.disputes).toEqual([]);

            fixture.rest.clearPostgrestRequests();
            const second = await successfulJson(await fixture.run(fixture.seed.runKey, 2));
            expect(second).toMatchObject({
                runId: fixture.seed.runId,
                runKey: fixture.seed.runKey,
                status: "succeeded",
            });
            expect(second.payments).toEqual([]);
            expect(second.commerceOperations).toEqual([]);
            expect((second.disputes as JsonRecord[]).map(row => row.providerEventId)).toEqual([
                fixture.seed.disputeProjectionKey,
            ]);

            fixture.rest.clearPostgrestRequests();
            const drained = await successfulJson(await fixture.run(fixture.seed.runKey, 2));
            expect(drained.payments).toEqual([]);
            expect(drained.commerceOperations).toEqual([]);
            expect(drained.disputes).toEqual([]);
            expect(fixture.rest.stripeRequests).toEqual([]);
        });
    });
}
