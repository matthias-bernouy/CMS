import { describe, expect, test } from "bun:test";
import {
    paymentLedgerFinancialTermsHash,
    successfulJson,
    type CreateProviderReconciliationHarness,
    type ProviderReconciliationHarness,
} from "../harness";

async function createUncapturedPayment(
    createHarness: CreateProviderReconciliationHarness,
    reference: string,
): Promise<ProviderReconciliationHarness & { paymentId: number; paymentIntentId: string }> {
    const harness = await createHarness();
    await successfulJson(
        await harness.submit(
            "user-123",
            "createConnectOnboardingSessionForUser",
            {
                email: "seller-stale-context@example.com",
            },
            { userId: "seller-stale-context" },
        ),
    );
    const created = await successfulJson(
        await harness.submit("user-123", "createProtectedPayment", {
            sellerUserId: "seller-stale-context",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: reference,
            financialTermsHash: paymentLedgerFinancialTermsHash,
            dualApprovalThresholdAmount: 1000,
        }),
    );
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
    return {
        ...harness,
        paymentId: Number(created.paymentId),
        paymentIntentId: String(created.stripePaymentIntentId),
    };
}

export function registerStalePaymentLocalContextContracts(createHarness: CreateProviderReconciliationHarness): void {
    describe("stripe-connect stale payment local context contracts", () => {
        test("preserves an uncaptured payment snapshot without charged-provider reads", async () => {
            const fixture = await createUncapturedPayment(createHarness, "stale-local-context-uncaptured");

            const result = await successfulJson(
                await fixture.submit("system-stale-context", "reconcileProviderPayment", {
                    paymentId: fixture.paymentId,
                }),
            );

            expect(result).toMatchObject({
                paymentId: fixture.paymentId,
                clientReferenceId: "stale-local-context-uncaptured",
                stripePaymentIntentId: fixture.paymentIntentId,
                stripeChargeId: null,
                refundedAmount: 0,
                transferredAmount: 0,
                reversedAmount: 0,
                paymentStatus: "created",
                settlementStatus: "held",
                disputeStatus: "none",
                manualReviewReason: null,
                paidAt: null,
                lastProviderSyncAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            });
            expect(fixture.rest.stripeRequests.map((request) => [request.method, request.pathname])).toEqual([
                ["GET", `/v1/payment_intents/${fixture.paymentIntentId}`],
            ]);
            expect(fixture.rest.postgrestRequests.map((request) => [request.method, request.table])).toEqual([
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
                ["POST", "rpc/read_payment_reconciliation_local_context"],
                ["POST", "rpc/read_payment_reconciliation_ledger"],
                ["PATCH", "payments"],
            ]);
        });

        test("keeps a fresh individual provider read before ledgering a nonterminal refund", async () => {
            const fixture = await createUncapturedPayment(createHarness, "stale-local-context-pending-refund");
            fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            await successfulJson(
                await fixture.submit("system-stale-context", "reconcileProviderPayment", {
                    paymentId: fixture.paymentId,
                }),
            );
            fixture.rest.setNextRefundStatus("pending");
            await successfulJson(
                await fixture.submit("system-stale-context", "requestProtectedRefund", {
                    paymentId: fixture.paymentId,
                    refundRequestId: "stale-local-context-pending-refund",
                    commerceRefundRequestId: 1701,
                    amount: 300,
                    authorizedSellerAmount: 780,
                    sellerEntitlementReductionAmount: 300,
                    reason: "stale local context characterization",
                }),
            );
            fixture.rest.clearPostgrestRequests();
            fixture.rest.clearStripeRequests();

            const result = await successfulJson(
                await fixture.submit("system-stale-context", "reconcileProviderPayment", {
                    paymentId: fixture.paymentId,
                }),
            );

            expect(result).toMatchObject({
                paymentId: fixture.paymentId,
                paymentStatus: "succeeded",
                refundedAmount: 0,
                settlementStatus: "refund_pending",
            });
            expect(fixture.rest.stripeRequests.map((request) => [request.method, request.pathname])).toEqual([
                ["GET", `/v1/payment_intents/${fixture.paymentIntentId}`],
                ["GET", "/v1/disputes"],
                ["GET", "/v1/refunds"],
                ["GET", "/v1/transfers"],
                ["GET", "/v1/refunds/re_1"],
            ]);
            const databaseCalls = fixture.rest.postgrestRequests.map(
                (request) => [request.method, request.table] as const,
            );
            const refundPatches = databaseCalls
                .map((call, index) => (call[0] === "PATCH" && call[1] === "refunds" ? index : -1))
                .filter((index) => index >= 0);
            const ledgerIndex = databaseCalls.findIndex(
                (call) => call[0] === "POST" && call[1] === "rpc/read_payment_reconciliation_ledger",
            );
            expect(databaseCalls.filter((call) => call[1] === "rpc/read_payment_reconciliation_local_context")).toEqual(
                [["POST", "rpc/read_payment_reconciliation_local_context"]],
            );
            expect(refundPatches).toHaveLength(2);
            expect(refundPatches.every((index) => index < ledgerIndex)).toBe(true);
            expect(databaseCalls.slice(-2)).toEqual([
                ["POST", "rpc/read_payment_reconciliation_ledger"],
                ["PATCH", "payments"],
            ]);
        });
    });
}
