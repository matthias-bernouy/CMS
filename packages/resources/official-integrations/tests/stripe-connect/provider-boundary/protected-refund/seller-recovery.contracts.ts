import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";
import { successfulReversalWriteBudget } from "../transfer-reversal/harness";
import { expectedRefundPreflightRequests } from "./expectations";
import { refundablePaymentFixture, requestProtectedRefund } from "./harness";

export const sellerRecoveryReplayBudget = [
    { method: "GET", table: "payments" },
    { method: "POST", table: "rpc/apply_payment_provider_projection" },
    { method: "GET", table: "refunds" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/enqueue_commerce_refund_projection" },
    { method: "POST", table: "rpc/read_refund_projection_context" },
    { method: "PATCH", table: "payments" },
    { method: "POST", table: "rpc/read_provider_transfer_reconciliation_context" },
    { method: "PATCH", table: "transfers" },
    { method: "POST", table: "rpc/read_payment_reconciliation_local_context" },
    { method: "POST", table: "rpc/read_payment_reconciliation_ledger" },
    { method: "PATCH", table: "payments" },
    { method: "POST", table: "rpc/read_refund_preflight_context" },
    { method: "GET", table: "transfer_recovery_requests" },
    { method: "GET", table: "transfer_recovery_requests" },
    { method: "POST", table: "rpc/upsert_seller_recovery_exposure_and_refresh" },
    { method: "POST", table: "rpc/claim_seller_payout_hold" },
    { method: "POST", table: "rpc/reserve_transfer_recovery" },
    ...successfulReversalWriteBudget.slice(6),
    { method: "GET", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "payments" },
];

export function registerProtectedRefundSellerRecoveryContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected refund seller recovery contracts", () => {
        test("replays a completed seller recovery without moving money twice", async () => {
            const fixture = await refundablePaymentFixture(createHarness);
            const release = await fixture.harness.submit("finance-1", "admin", "requestSettlementRelease", {
                paymentId: fixture.paymentId,
                releaseAuthorizationId: "release-for-protected-refund",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            });
            expect(release.status).toBe(200);
            clearRequests(fixture.harness);

            const refundPatch = {
                amount: 1200,
                authorizedSellerAmount: 0,
                sellerEntitlementReductionAmount: 1080,
                reason: "full buyer remedy",
            };
            const first = await requestProtectedRefund(fixture, refundPatch);
            const firstBody = await responseBody(first);
            expect(first.status).toBe(200);
            expect(fixture.harness.rest.rows("transfer_recovery_requests")).toHaveLength(1);
            clearRequests(fixture.harness);

            const replay = await requestProtectedRefund(fixture, refundPatch);
            const replayBody = await responseBody(replay);
            const firstPayment = firstBody.payment as Record<string, unknown>;
            const replayPayment = replayBody.payment as Record<string, unknown>;

            expect(replay.status).toBe(200);
            expect(replayBody).toEqual({
                ...firstBody,
                payment: {
                    ...firstPayment,
                    lastProviderSyncAt: replayPayment.lastProviderSyncAt,
                    settlementStatus: "reversed",
                },
            });
            expect(replayBody.reversal).toEqual(firstBody.reversal);
            expect(replayBody.operations).toEqual(firstBody.operations);
            expect(fixture.harness.rest.stripeRequests).toEqual(expectedRefundPreflightRequests());
            expect(fixture.harness.rest.stripeRequests.every(({ method }) => method === "GET")).toBe(true);
            expect(fixture.harness.rest.moneyCallOrder).toEqual(["transfer", "reversal", "refund"]);
            expect(fixture.harness.rest.refundCreateRequests).toHaveLength(1);
            expect(fixture.harness.rest.rows("transfer_recovery_requests")).toHaveLength(1);
            expect(fixture.harness.rest.rows("transfer_reversals")).toHaveLength(1);
            expect(postgrestBudget(fixture.harness)).toEqual(sellerRecoveryReplayBudget);
        });
    });
}
