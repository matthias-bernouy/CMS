import { describe, expect, test } from "bun:test";
import { type CreateProviderBoundaryHarness, type JsonRecord, postgrestBudget, responseBody } from "../../harness";
import {
    assertProtectedRefundPrivacy,
    expectedProtectedRefundResponse,
    expectedRefundPreflightRequests,
} from "../expectations";
import { refundablePaymentFixture, refundOperation, requestProtectedRefund } from "../harness";
import { createRefundBudget, refundCreateCall, refundCreateProviderRequest } from "./contracts";

const statusCases = [
    { status: "pending", settlementStatus: "refund_pending", commercePaymentStatus: "succeeded" },
    { status: "failed", settlementStatus: "manual_review", commercePaymentStatus: "manual_review" },
] as const;

export function registerProtectedRefundProjectionStatusContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected refund projection status contracts", () => {
        test("includes only succeeded ledger rows for pending and failed provider results", async () => {
            for (const statusCase of statusCases) {
                const fixture = await refundablePaymentFixture(createHarness);
                fixture.harness.rest.setNextRefundStatus(statusCase.status);
                const projectionPause = fixture.harness.rest.pauseNextPostgrestRead("refunds", 3);
                const pending = requestProtectedRefund(fixture);

                await projectionPause.entered;
                seedLedgerRows(fixture);
                projectionPause.resume();

                const response = await pending;
                const body = await responseBody(response);
                const expected = expectedProtectedRefundResponse(body, {
                    providerId: "re_1",
                    balanceTransactionId: "txn_refund_1",
                });
                const expectedRefund = expected.refund as JsonRecord;
                const providerSnapshot = { ...(expectedRefund.providerSnapshot as JsonRecord) };
                delete providerSnapshot.balance_transaction;
                providerSnapshot.status = statusCase.status;
                if (statusCase.status === "failed") {
                    providerSnapshot.failure_reason = "provider_declined";
                }
                const expectedOperation = (expected.operations as JsonRecord[])[0] ?? {};

                expect(response.status).toBe(200);
                expect(body).toEqual({
                    ...expected,
                    payment: {
                        ...(expected.payment as object),
                        refundedAmount: 125,
                        actualStripeRefundFeeAmount: 5,
                        actualStripeProcessingFeeAmount: 70,
                        actualPlatformMarginAfterStripeAmount: 50,
                        commercePaymentStatus: statusCase.commercePaymentStatus,
                        settlementStatus: statusCase.settlementStatus,
                    },
                    refund: {
                        ...expectedRefund,
                        stripeBalanceTransactionId: null,
                        status: statusCase.status,
                        failureReason: statusCase.status === "failed" ? "provider_declined" : null,
                        actualStripeNetAmount: null,
                        actualStripeFeeCurrency: null,
                        providerSnapshot,
                    },
                    operations: [
                        {
                            ...expectedOperation,
                            providerEventId: `operation:${String(expectedOperation.providerOperationId)}:${statusCase.status}`,
                            status: statusCase.status,
                            providerSnapshot,
                        },
                    ],
                });
                assertProtectedRefundPrivacy(body);
                expect(fixture.harness.rest.rows("payments")[0]).toMatchObject({
                    refunded_amount: 125,
                    actual_stripe_refund_fee_amount: 5,
                    actual_stripe_processing_fee_amount: 70,
                    settlement_status: statusCase.settlementStatus,
                });
                expect(fixture.harness.rest.stripeRequests).toEqual([
                    ...expectedRefundPreflightRequests(),
                    refundCreateProviderRequest,
                ]);
                expect(fixture.harness.rest.refundCreateRequests).toEqual([refundCreateCall]);
                expect(postgrestBudget(fixture.harness)).toEqual(createRefundBudget);
                expectSucceededFilters(fixture.harness.rest.postgrestRequests);
                expect(refundOperation(fixture)).toMatchObject({
                    status: statusCase.status === "pending" ? "processing" : "failed",
                    stripe_object_id: "re_1",
                    attempt_count: 1,
                    last_error: statusCase.status === "failed" ? "provider_declined" : null,
                });
            }
        });
    });
}

function seedLedgerRows(fixture: Awaited<ReturnType<typeof refundablePaymentFixture>>): void {
    for (const row of [
        { key: "succeeded", status: "succeeded", amount: 125, fee: 5, reduction: 80 },
        { key: "pending", status: "pending", amount: 700, fee: 70, reduction: 700 },
        { key: "failed", status: "failed", amount: 800, fee: 80, reduction: 800 },
    ]) {
        fixture.harness.rest.seedSettlementLedgerRow("refunds", {
            payment_id: fixture.paymentId,
            refund_request_id: `projection-status-${row.key}`,
            amount: row.amount,
            actual_stripe_fee_amount: row.fee,
            seller_entitlement_reduction_amount: row.reduction,
            currency: "eur",
            status: row.status,
        });
    }
}

function expectSucceededFilters(requests: Array<{ table: string; searchParams: string[][] }>): void {
    const enqueue = requests.findIndex(({ table }) => table === "rpc/enqueue_commerce_refund_projection");
    const refundReads = requests.slice(enqueue + 1, enqueue + 5).filter(({ table }) => table === "refunds");
    expect(refundReads).toHaveLength(3);
    for (const request of refundReads) {
        expect(request.searchParams).toContainEqual(["status", "eq.succeeded"]);
    }
}
