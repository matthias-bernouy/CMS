import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";
import {
    assertProtectedRefundPrivacy,
    expectedProtectedRefundResponse,
    expectedRefundPreflightRequests,
} from "./expectations";
import { refundablePaymentFixture, requestProtectedRefund } from "./harness";

const mismatchCases = [
    {
        name: "amount",
        patch: { amount: 301 },
        error: "refund request replay mismatch",
    },
    {
        name: "Commerce request identity",
        patch: { commerceRefundRequestId: 702 },
        error: "refund request replay mismatch",
    },
    {
        name: "seller entitlement",
        patch: { sellerEntitlementReductionAmount: 299, authorizedSellerAmount: 781 },
        error: "refund seller entitlement replay mismatch",
    },
];

const replayBudget = [
    { method: "GET", table: "payments" },
    { method: "POST", table: "rpc/apply_payment_provider_projection" },
    { method: "GET", table: "refunds" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/enqueue_commerce_refund_projection" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "PATCH", table: "payments" },
    { method: "POST", table: "rpc/read_payment_reconciliation_local_context" },
    { method: "POST", table: "rpc/read_payment_reconciliation_ledger" },
    { method: "PATCH", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "transfer_recovery_requests" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "payments" },
];

export function registerProtectedRefundReplayContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected refund replay contracts", () => {
        test("replays the same refund without another provider write and retains the original reason", async () => {
            const fixture = await refundablePaymentFixture(createHarness);
            expect((await requestProtectedRefund(fixture)).status).toBe(200);
            clearRequests(fixture.harness);

            const replay = await requestProtectedRefund(fixture, { reason: "different replay explanation" });
            const body = await responseBody(replay);

            expect(replay.status).toBe(200);
            expect(body).toEqual(
                expectedProtectedRefundResponse(body, {
                    providerId: "re_1",
                    balanceTransactionId: "txn_refund_1",
                }),
            );
            assertProtectedRefundPrivacy(body);
            expect(fixture.harness.rest.stripeRequests).toEqual(expectedRefundPreflightRequests());
            expect(postgrestBudget(fixture.harness)).toEqual(replayBudget);
            expect(fixture.harness.rest.refundCreateRequests).toHaveLength(1);
            expect(fixture.harness.rest.rows("refunds")).toHaveLength(1);
        });

        test("rejects immutable refund and entitlement replay mismatches before a provider write", async () => {
            for (const mismatch of mismatchCases) {
                const fixture = await refundablePaymentFixture(createHarness);
                expect((await requestProtectedRefund(fixture)).status).toBe(200);
                clearRequests(fixture.harness);

                const response = await requestProtectedRefund(fixture, mismatch.patch);
                const body = await responseBody(response);

                expect(response.status, mismatch.name).toBe(409);
                expect(body).toEqual({ error: mismatch.error });
                expect(JSON.stringify(body)).not.toContain("protected-refund-1");
                expect(JSON.stringify(body)).not.toContain("ch_1");
                expect(fixture.harness.rest.stripeRequests).toEqual(expectedRefundPreflightRequests());
                expect(fixture.harness.rest.refundCreateRequests).toHaveLength(1);
                expect(fixture.harness.rest.rows("refunds")).toHaveLength(1);
            }
        });
    });
}
