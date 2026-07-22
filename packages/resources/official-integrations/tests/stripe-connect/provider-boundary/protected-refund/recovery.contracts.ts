import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";
import {
    assertProtectedRefundPrivacy,
    expectedProtectedRefundResponse,
    expectedRefundListRequest,
    expectedRefundPreflightRequests,
} from "./expectations";
import { refundablePaymentFixture, refundOperation, requestProtectedRefund } from "./harness";

export const recoveredRefundBudget = [
    { method: "GET", table: "payments" },
    { method: "POST", table: "rpc/apply_payment_provider_projection" },
    { method: "GET", table: "refunds" },
    { method: "POST", table: "rpc/mark_payment_manual_review" },
    { method: "POST", table: "provider_exceptions" },
    { method: "POST", table: "rpc/read_payment_reconciliation_local_context" },
    { method: "POST", table: "rpc/read_payment_reconciliation_ledger" },
    { method: "PATCH", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "transfer_recovery_requests" },
    { method: "GET", table: "refunds" },
    { method: "POST", table: "rpc/reserve_financial_operation" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/enqueue_commerce_refund_projection" },
    { method: "POST", table: "rpc/read_refund_projection_context" },
    { method: "PATCH", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "payments" },
];

const succeededOperationBudget = [
    { method: "GET", table: "payments" },
    { method: "POST", table: "rpc/apply_payment_provider_projection" },
    { method: "POST", table: "rpc/read_payment_reconciliation_local_context" },
    { method: "POST", table: "rpc/read_payment_reconciliation_ledger" },
    { method: "PATCH", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "transfer_recovery_requests" },
    { method: "GET", table: "refunds" },
    { method: "POST", table: "rpc/reserve_financial_operation" },
    { method: "POST", table: "refunds" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/enqueue_commerce_refund_projection" },
    { method: "POST", table: "rpc/read_refund_projection_context" },
    { method: "PATCH", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "payments" },
];

export function registerProtectedRefundRecoveryContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected refund recovery contracts", () => {
        test("recovers a lost Stripe Refund response by exact metadata without creating twice", async () => {
            const fixture = await refundablePaymentFixture(createHarness);
            fixture.harness.rest.loseNextRefundCreationResponse();

            const first = await requestProtectedRefund(fixture);

            expect(first.status).toBe(500);
            expect(await responseBody(first)).toEqual({ error: "internal error" });
            expect(fixture.harness.rest.refundCreateRequests).toEqual([
                {
                    parameters: [
                        ["charge", "ch_1"],
                        ["amount", "300"],
                        ["metadata[refund_request_id]", "protected-refund-1"],
                        ["expand[]", "balance_transaction"],
                        ["metadata[commerce_reason]", "partial buyer remedy"],
                    ],
                    idempotencyKey: "cms:refund:40a6874eb08b0ca64d575b5edb62f56c01d20532f8c15346bc82f8705d4eed6c",
                },
            ]);
            expect(refundOperation(fixture)).toMatchObject({
                status: "manual_review",
                stripe_object_id: null,
                attempt_count: 1,
                last_error: "simulated network loss after Stripe created the Refund",
            });
            clearRequests(fixture.harness);

            const recovered = await requestProtectedRefund(fixture);
            const body = await responseBody(recovered);

            expect(recovered.status).toBe(200);
            expect(body).toEqual(
                expectedProtectedRefundResponse(body, {
                    providerId: "re_1",
                    balanceTransactionId: "txn_refund_1",
                    settlementStatus: "manual_review",
                    manualReviewReason: "untracked Stripe refund re_1",
                }),
            );
            assertProtectedRefundPrivacy(body);
            expect(fixture.harness.rest.stripeRequests).toEqual([
                ...expectedRefundPreflightRequests(),
                expectedRefundListRequest(),
            ]);
            expect(postgrestBudget(fixture.harness)).toEqual(recoveredRefundBudget);
            expect(fixture.harness.rest.refundCreateRequests).toHaveLength(1);
            expect(refundOperation(fixture)).toMatchObject({
                status: "succeeded",
                stripe_object_id: "re_1",
                attempt_count: 1,
                last_error: null,
            });
            expect(fixture.harness.rest.rows("refunds")).toHaveLength(1);
        });

        test("retrieves an already-succeeded refund operation by ID without creating a Refund", async () => {
            const fixture = await refundablePaymentFixture(createHarness);
            fixture.harness.rest.succeedNextRefundOperation();

            const response = await requestProtectedRefund(fixture);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(
                expectedProtectedRefundResponse(body, {
                    providerId: "re_operation_succeeded",
                    balanceTransactionId: "txn_refund_operation_succeeded",
                }),
            );
            assertProtectedRefundPrivacy(body);
            expect(fixture.harness.rest.stripeRequests).toEqual([
                ...expectedRefundPreflightRequests(),
                {
                    method: "GET",
                    pathname: "/v1/refunds/re_operation_succeeded",
                    searchParams: [["expand[]", "balance_transaction"]],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
            ]);
            expect(fixture.harness.rest.refundCreateRequests).toEqual([]);
            expect(postgrestBudget(fixture.harness)).toEqual(succeededOperationBudget);
            expect(refundOperation(fixture)).toMatchObject({
                status: "succeeded",
                stripe_object_id: "re_operation_succeeded",
                attempt_count: 1,
            });
            expect(fixture.harness.rest.rows("refunds")).toHaveLength(1);
        });
    });
}
