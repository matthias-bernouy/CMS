import { describe, expect, test } from "bun:test";
import {
    createPaymentLedgerFixture,
    createTrackedProviderTransferFixture,
    successfulJson,
    type CreateProviderReconciliationHarness,
} from "../harness";

export function registerProviderTransferContextContracts(
    createHarness: CreateProviderReconciliationHarness,
): void {
    describe("stripe-connect provider transfer reconciliation contracts", () => {
        test("preserves a tracked transfer projection and provider order", async () => {
            const fixture = await createTrackedProviderTransferFixture(
                createHarness,
                "provider-transfer-context",
            );

            const result = await successfulJson(await fixture.submit(
                "system-transfer-context",
                "reconcileProviderPayment",
                { paymentId: fixture.paymentId },
            ));

            expect(result).toMatchObject({
                paymentId: fixture.paymentId,
                stripePaymentIntentId: fixture.paymentIntentId,
                transferredAmount: 1080,
                reversedAmount: 0,
                settlementStatus: "released",
                reconciliationPending: false,
                manualReviewReason: null,
            });
            expect(fixture.rest.rows("transfers")[0]).toMatchObject({
                stripe_transfer_id: fixture.stripeTransferIds[0],
                amount: 1080,
                status: "succeeded",
                provider_snapshot: expect.objectContaining({
                    id: fixture.stripeTransferIds[0],
                    amount_reversed: 0,
                    reversed: false,
                }),
            });
            expect(fixture.rest.stripeRequests.map(request => [request.method, request.pathname]))
                .toEqual([
                    ["GET", `/v1/payment_intents/${fixture.paymentIntentId}`],
                    ["GET", "/v1/disputes"],
                    ["GET", "/v1/refunds"],
                    ["GET", "/v1/transfers"],
                ]);
            expect(fixture.rest.postgrestRequests.map(request => [request.method, request.table]))
                .toEqual([
                    ["GET", "payments"],
                    ["POST", "rpc/apply_payment_provider_projection"],
                    ["POST", "rpc/read_provider_transfer_reconciliation_context"],
                    ["PATCH", "transfers"],
                    ["POST", "rpc/read_payment_reconciliation_local_context"],
                    ["POST", "rpc/read_payment_reconciliation_ledger"],
                    ["PATCH", "payments"],
                ]);
        });

        test("counts only succeeded local reversals when mapping transfer status", async () => {
            const fixture = await createTrackedProviderTransferFixture(
                createHarness,
                "provider-transfer-reversal-status",
            );
            const transferId = fixture.stripeTransferIds[0]!;
            fixture.rest.seedLocalTransferReversal(transferId, 300, "succeeded");
            fixture.rest.seedLocalTransferReversal(transferId, 500, "failed");
            fixture.rest.patchProviderTransfer(transferId, { amount_reversed: 300, reversed: false });

            const result = await successfulJson(await fixture.submit(
                "system-transfer-context",
                "reconcileProviderPayment",
                { paymentId: fixture.paymentId },
            ));

            expect(result).toMatchObject({
                transferredAmount: 1080,
                reversedAmount: 300,
                settlementStatus: "released",
                manualReviewReason: null,
            });
            expect(fixture.rest.rows("transfers")[0]).toMatchObject({
                status: "partially_reversed",
                provider_snapshot: expect.objectContaining({ amount_reversed: 300, reversed: false }),
            });
            expect(fixture.rest.rows("provider_exceptions")).toEqual([]);
        });

        test("preserves transfer reversal mismatch quarantine before the transfer update", async () => {
            const fixture = await createTrackedProviderTransferFixture(
                createHarness,
                "provider-transfer-reversal-mismatch",
            );
            const transferId = fixture.stripeTransferIds[0]!;
            fixture.rest.seedLocalTransferReversal(transferId, 300, "succeeded");
            fixture.rest.patchProviderTransfer(transferId, { amount_reversed: 301, reversed: false });

            const result = await successfulJson(await fixture.submit(
                "system-transfer-context",
                "reconcileProviderPayment",
                { paymentId: fixture.paymentId },
            ));

            expect(result).toMatchObject({
                settlementStatus: "manual_review",
                manualReviewReason: `untracked Stripe transfer_reversal ${transferId}`,
            });
            expect(fixture.rest.rows("provider_exceptions")).toContainEqual(expect.objectContaining({
                deduplication_key: `untracked:transfer_reversal:${transferId}`,
                payment_id: fixture.paymentId,
                exception_type: "untracked_provider_transfer_reversal",
                status: "open",
                details: expect.objectContaining({
                    providerSnapshot: expect.objectContaining({
                        providerReversedAmount: 301,
                        localReversedAmount: 300,
                    }),
                }),
            }));
            expect(fixture.rest.postgrestRequests.slice(2, 6).map(request => [request.method, request.table]))
                .toEqual([
                    ["POST", "rpc/read_provider_transfer_reconciliation_context"],
                    ["POST", "rpc/mark_payment_manual_review"],
                    ["POST", "provider_exceptions"],
                    ["PATCH", "transfers"],
                ]);
        });

        test("keeps an untracked provider transfer quarantined without a local transfer update", async () => {
            const fixture = await createPaymentLedgerFixture(
                createHarness,
                "provider-transfer-untracked",
            );
            const payment = fixture.rest.rows("payments")[0]!;
            const transferId = fixture.rest.addProviderTransfer(String(payment.transfer_group));

            const result = await successfulJson(await fixture.submit(
                "system-transfer-context",
                "reconcileProviderPayment",
                { paymentId: fixture.paymentId },
            ));

            expect(result).toMatchObject({
                settlementStatus: "manual_review",
                manualReviewReason: `untracked Stripe transfer ${transferId}`,
            });
            expect(fixture.rest.rows("provider_exceptions")).toContainEqual(expect.objectContaining({
                deduplication_key: `untracked:transfer:${transferId}`,
                payment_id: fixture.paymentId,
                exception_type: "untracked_provider_transfer",
                message: `untracked Stripe transfer ${transferId}`,
                details: {
                    providerSnapshot: expect.objectContaining({ id: transferId }),
                },
            }));
            expect(fixture.rest.postgrestRequests.filter(request => (
                request.method === "PATCH" && request.table === "transfers"
            ))).toEqual([]);
        });
    });
}
