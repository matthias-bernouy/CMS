import { describe, expect, test } from "bun:test";
import { type CreateProviderBoundaryHarness, type JsonRecord, postgrestBudget, responseBody } from "../../harness";
import { expectedProtectedRefundResponse } from "../expectations";
import { refundablePaymentFixture, requestProtectedRefund } from "../harness";
import { createRefundBudget } from "./contracts";

export function registerProtectedRefundProjectionInterleavingContracts(
    createHarness: CreateProviderBoundaryHarness,
): void {
    describe("stripe-connect protected refund projection read contracts", () => {
        test("observes each committed value in refund total, fee, payment, then entitlement order", async () => {
            const fixture = await refundablePaymentFixture(createHarness);
            const amountPause = fixture.harness.rest.pauseNextPostgrestRead("refunds", 3);
            const pending = requestProtectedRefund(fixture);

            await amountPause.entered;
            seedRefund(fixture, "amount-visible", "succeeded", 100, 4, 20);
            seedRefund(fixture, "pending-excluded", "pending", 900, 90, 900);
            seedRefund(fixture, "failed-excluded", "failed", 800, 80, 800);
            const feePause = fixture.harness.rest.pauseNextPostgrestRead("refunds");
            amountPause.resume();

            await feePause.entered;
            seedRefund(fixture, "fee-visible", "succeeded", 200, 6, 30);
            const paymentPause = fixture.harness.rest.pauseNextPostgrestRead("payments");
            feePause.resume();

            await paymentPause.entered;
            fixture.harness.rest.patchPaymentLedger(fixture.paymentId, {
                actual_stripe_charge_fee_amount: 75,
                transferred_amount: 700,
            });
            const entitlementPause = fixture.harness.rest.pauseNextPostgrestRead("refunds");
            paymentPause.resume();

            await entitlementPause.entered;
            fixture.harness.rest.patchPaymentLedger(fixture.paymentId, {
                actual_stripe_charge_fee_amount: 95,
            });
            seedRefund(fixture, "entitlement-visible", "succeeded", 300, 8, 40);
            entitlementPause.resume();

            const response = await pending;
            const body = await responseBody(response);
            const expected = expectedProtectedRefundResponse(body, {
                providerId: "re_1",
                balanceTransactionId: "txn_refund_1",
                settlementStatus: "released",
            });

            expect(response.status).toBe(200);
            expect(body).toEqual({
                ...expected,
                payment: {
                    ...(expected.payment as object),
                    refundedAmount: 400,
                    transferredAmount: 700,
                    actualStripeChargeFeeAmount: 95,
                    actualStripeRefundFeeAmount: 10,
                    actualStripeProcessingFeeAmount: 85,
                    actualPlatformMarginAfterStripeAmount: 35,
                },
            });
            expect(fixture.harness.rest.rows("payments")[0]).toMatchObject({
                refunded_amount: 400,
                transferred_amount: 700,
                actual_stripe_charge_fee_amount: 95,
                actual_stripe_refund_fee_amount: 10,
                actual_stripe_processing_fee_amount: 85,
                settlement_status: "released",
            });
            expect(postgrestBudget(fixture.harness)).toEqual(createRefundBudget);
            expectProjectionContextCall(fixture.harness.rest.postgrestRequests, fixture.paymentId);
        });
    });
}

function seedRefund(
    fixture: Awaited<ReturnType<typeof refundablePaymentFixture>>,
    key: string,
    status: "succeeded" | "pending" | "failed",
    amount: number,
    fee: number,
    reduction: number,
): void {
    fixture.harness.rest.seedSettlementLedgerRow("refunds", {
        payment_id: fixture.paymentId,
        refund_request_id: `projection-${key}`,
        amount,
        actual_stripe_fee_amount: fee,
        seller_entitlement_reduction_amount: reduction,
        currency: "eur",
        status,
    });
}

function expectProjectionContextCall(
    requests: Array<{ method: string; table: string; searchParams: string[][]; body: JsonRecord | null }>,
    paymentId: number,
): void {
    const enqueue = requests.findIndex(({ table }) => table === "rpc/enqueue_commerce_refund_projection");
    expect(requests[enqueue + 1]).toEqual({
        method: "POST",
        table: "rpc/read_refund_projection_context",
        searchParams: [],
        body: { p_payment_id: paymentId },
    });
}
