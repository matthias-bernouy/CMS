import { describe, expect, test } from "bun:test";
import {
    createTrackedProviderTransferFixture,
    paymentLedgerFinancialTermsHash,
    successfulJson,
    type CreateProviderReconciliationHarness,
} from "../harness";

export function registerStalePaymentLocalContextFailureContracts(
    createHarness: CreateProviderReconciliationHarness,
): void {
    describe("stripe-connect stale payment local context failure contracts", () => {
        test("returns the context failure after preserving prior provider progress", async () => {
            const fixture = await createTrackedProviderTransferFixture(
                createHarness,
                "stale-local-context-direct-failure",
            );
            const transferId = fixture.stripeTransferIds[0]!;
            fixture.rest.patchProviderTransfer(transferId, { reconciliation_marker: "before-context" });
            fixture.rest.failNextPaymentReconciliationLocalContextRead();

            const failed = await fixture.submit(
                "system-stale-context",
                "reconcileProviderPayment",
                { paymentId: fixture.paymentId },
            );

            expect(failed.status).toBe(502);
            expect(await failed.json()).toEqual({
                error: "simulated payment reconciliation local context read failure",
            });
            expect(fixture.rest.rows("transfers")[0]?.provider_snapshot).toMatchObject({
                reconciliation_marker: "before-context",
            });
            const calls = fixture.rest.postgrestRequests.map(request => [request.method, request.table]);
            const contextIndex = calls.findIndex(call => (
                call[1] === "rpc/read_payment_reconciliation_local_context"
            ));
            expect(calls.slice(contextIndex)).toEqual([
                ["POST", "rpc/read_payment_reconciliation_local_context"],
            ]);
            expect(calls.some(call => call[1] === "rpc/read_payment_reconciliation_ledger")).toBe(false);
            expect(calls.some(call => call[0] === "PATCH" && call[1] === "payments")).toBe(false);
        });

        test("marks only the failed stale payment and continues with the next one", async () => {
            const fixture = await createTrackedProviderTransferFixture(
                createHarness,
                "stale-local-context-run-failure",
            );
            const firstTransferId = fixture.stripeTransferIds[0]!;
            fixture.rest.patchProviderTransfer(firstTransferId, { reconciliation_marker: "first-progress" });
            await successfulJson(await fixture.submit("user-123", "createConnectOnboardingSessionForUser", {
                email: "seller-next-stale-context@example.com",
            }, { userId: "seller-next-stale-context" }));
            const second = await successfulJson(await fixture.submit("user-123", "createProtectedPayment", {
                sellerUserId: "seller-next-stale-context",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "stale-local-context-next-payment",
                financialTermsHash: paymentLedgerFinancialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }));
            const secondPaymentId = Number(second.paymentId);
            fixture.rest.setPaymentIntentSucceeded(String(second.stripePaymentIntentId));
            fixture.rest.clearPostgrestRequests();
            fixture.rest.clearStripeRequests();
            fixture.rest.failNextPaymentReconciliationLocalContextRead();

            const run = await successfulJson(await fixture.run("stale-local-context-isolation", 10));

            expect(run).toMatchObject({ exceptionCount: 1 });
            expect(fixture.rest.rows("transfers")[0]?.provider_snapshot).toMatchObject({
                reconciliation_marker: "first-progress",
            });
            expect(fixture.rest.rows("payments").find(row => row.id === fixture.paymentId)).toMatchObject({
                settlement_status: "manual_review",
                manual_review_reason: "stale provider payment reconciliation failed",
            });
            expect(fixture.rest.rows("payments").find(row => row.id === secondPaymentId)).toMatchObject({
                payment_status: "succeeded",
                settlement_status: "held",
                last_provider_sync_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            });
            const tables = fixture.rest.postgrestRequests.map(request => request.table);
            expect(tables.filter(table => table === "rpc/read_payment_reconciliation_local_context"))
                .toHaveLength(2);
            expect(tables.filter(table => table === "rpc/read_payment_reconciliation_ledger"))
                .toHaveLength(1);
            expect(tables).toContain("rpc/mark_payment_manual_review");
        });
    });
}
