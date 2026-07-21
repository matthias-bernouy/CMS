import { describe, expect, test } from "bun:test";
import {
    createPaymentLedgerFixture,
    type CreateProviderReconciliationHarness,
} from "../harness";

export function registerPaymentReconciliationLedgerDivergenceContracts(
    createHarness: CreateProviderReconciliationHarness,
): void {
    describe("stripe-connect payment reconciliation ledger divergence contracts", () => {
        test("keeps seller recovery divergence fail-closed before settlement", async () => {
            const fixture = await createPaymentLedgerFixture(
                createHarness,
                "payment-ledger-seller-recovery-divergence",
            );
            fixture.rest.setPaymentReconciliationSellerRecoveryAmount(fixture.paymentId, 1081);

            const failed = await fixture.submit("system-ledger", "requestSettlementRelease", {
                paymentId: fixture.paymentId,
                releaseAuthorizationId: "release-ledger-divergence",
                releaseKind: "initial",
                amount: 1,
                currency: "eur",
            });

            expect(failed.status).toBe(409);
            expect(await failed.json()).toEqual({
                error: "provider ledger arithmetic divergence requires finance review",
            });
            expect(fixture.rest.rows("payments")[0]).toMatchObject({
                settlement_status: "manual_review",
                manual_review_reason: "provider ledger arithmetic divergence",
            });
            expect(fixture.rest.stripeRequests.some(request => (
                request.method === "POST" && request.pathname === "/v1/transfers"
            ))).toBe(false);
            expect(fixture.rest.postgrestRequests.find(request => (
                request.table === "rpc/mark_payment_manual_review"
            ))?.body).toEqual({
                p_payment_id: fixture.paymentId,
                p_reason: "provider ledger arithmetic divergence",
                p_details: {
                    refundedAmount: 200,
                    transferredAmount: 900,
                    reversedAmount: 200,
                    sellerRecoveryAmount: 1081,
                    authorizedSellerAmount: -1,
                    netTransferredAmount: 700,
                },
            });
        });
    });
}
