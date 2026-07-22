import { describe, expect, test } from "bun:test";
import { type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";
import {
    assertProtectedRefundPrivacy,
    expectedProtectedRefundResponse,
    expectedRefundPreflightRequests,
} from "./expectations";
import { refundablePaymentFixture, refundOperation, requestProtectedRefund } from "./harness";

export const refundIdempotencyKey = "cms:refund:40a6874eb08b0ca64d575b5edb62f56c01d20532f8c15346bc82f8705d4eed6c";

export const refundCreateProviderRequest = {
    method: "POST",
    pathname: "/v1/refunds",
    searchParams: [],
    idempotencyKey: refundIdempotencyKey,
    stripeAccount: null,
};

export const refundCreateCall = {
    parameters: [
        ["charge", "ch_1"],
        ["amount", "300"],
        ["metadata[refund_request_id]", "protected-refund-1"],
        ["expand[]", "balance_transaction"],
        ["metadata[commerce_reason]", "partial buyer remedy"],
    ],
    idempotencyKey: refundIdempotencyKey,
};

export const createRefundBudget = [
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
    { method: "PATCH", table: "financial_operations" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/enqueue_commerce_refund_projection" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "PATCH", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "payments" },
];

const createRefundExternalOrder = [
    "postgrest:GET:payments",
    "stripe:GET:/v1/payment_intents/pi_1",
    "postgrest:POST:rpc/apply_payment_provider_projection",
    "stripe:GET:/v1/disputes",
    "stripe:GET:/v1/refunds",
    "stripe:GET:/v1/transfers",
    "postgrest:POST:rpc/read_payment_reconciliation_local_context",
    "postgrest:POST:rpc/read_payment_reconciliation_ledger",
    "postgrest:PATCH:payments",
    "postgrest:GET:refunds",
    "postgrest:GET:refunds",
    "postgrest:GET:transfer_recovery_requests",
    "postgrest:GET:refunds",
    "postgrest:POST:rpc/reserve_financial_operation",
    "postgrest:POST:refunds",
    "postgrest:PATCH:financial_operations",
    "postgrest:PATCH:refunds",
    "stripe:POST:/v1/refunds",
    "postgrest:PATCH:refunds",
    "postgrest:PATCH:refunds",
    "postgrest:PATCH:financial_operations",
    "postgrest:POST:rpc/enqueue_commerce_refund_projection",
    "postgrest:GET:refunds",
    "postgrest:GET:refunds",
    "postgrest:GET:payments",
    "postgrest:GET:refunds",
    "postgrest:PATCH:payments",
    "postgrest:GET:refunds",
    "postgrest:GET:payments",
];

export function registerProtectedRefundSuccessContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected refund success contracts", () => {
        test("creates one exact Refund and returns the complete private-system projection", async () => {
            const fixture = await refundablePaymentFixture(createHarness);

            const response = await requestProtectedRefund(fixture);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(
                expectedProtectedRefundResponse(body, {
                    providerId: "re_1",
                    balanceTransactionId: "txn_refund_1",
                }),
            );
            assertProtectedRefundPrivacy(body);
            expect(fixture.harness.rest.stripeRequests).toEqual([
                ...expectedRefundPreflightRequests(),
                refundCreateProviderRequest,
            ]);
            expect(fixture.harness.rest.refundCreateRequests).toEqual([refundCreateCall]);
            expect(postgrestBudget(fixture.harness)).toEqual(createRefundBudget);
            expect(fixture.harness.rest.externalRequestOrder).toEqual(createRefundExternalOrder);
            expect(fixture.harness.rest.rows("refunds")).toHaveLength(1);
            expect(refundOperation(fixture)).toMatchObject({
                status: "succeeded",
                stripe_object_id: "re_1",
                attempt_count: 1,
                last_error: null,
            });
        });

        test("returns refund and payment values reloaded after the refund application completes", async () => {
            const fixture = await refundablePaymentFixture(createHarness);
            const pause = fixture.harness.rest.pauseNextRefundReload();
            const pendingResponse = requestProtectedRefund(fixture);
            await pause.entered;
            const refundId = Number(fixture.harness.rest.rows("refunds")[0]?.id);
            fixture.harness.rest.patchRefundLedger(refundId, { reason: "concurrent refund value" });
            fixture.harness.rest.patchPaymentLedger(fixture.paymentId, { description: "concurrent payment value" });
            pause.resume();

            const response = await pendingResponse;
            const body = await responseBody(response);
            const expected = expectedProtectedRefundResponse(body, {
                providerId: "re_1",
                balanceTransactionId: "txn_refund_1",
            });

            expect(response.status).toBe(200);
            expect(body).toEqual({
                ...expected,
                payment: { ...(expected.payment as object), description: "concurrent payment value" },
                refund: { ...(expected.refund as object), reason: "concurrent refund value" },
            });
            expect(postgrestBudget(fixture.harness)).toEqual(createRefundBudget);
        });
    });
}
