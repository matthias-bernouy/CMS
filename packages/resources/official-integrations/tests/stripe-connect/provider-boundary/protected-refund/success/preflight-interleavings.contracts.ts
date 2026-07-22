import { describe, expect, test } from "bun:test";
import { type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../../harness";
import { expectedRefundPreflightRequests } from "../expectations";
import { refundablePaymentFixture, requestProtectedRefund } from "../harness";

const preflightBudget = [
    { method: "GET", table: "payments" },
    { method: "POST", table: "rpc/apply_payment_provider_projection" },
    { method: "POST", table: "rpc/read_payment_reconciliation_local_context" },
    { method: "POST", table: "rpc/read_payment_reconciliation_ledger" },
    { method: "PATCH", table: "payments" },
    { method: "GET", table: "refunds" },
    { method: "GET", table: "refunds" },
];

const interleavings = [
    {
        status: "pending",
        reduction: 0,
        error: "another refund is awaiting terminal provider confirmation",
    },
    {
        status: "succeeded",
        reduction: 100,
        error: "refund seller entitlement target is stale or invalid",
    },
] as const;

export function registerProtectedRefundPreflightInterleavingContracts(
    createHarness: CreateProviderBoundaryHarness,
): void {
    describe("stripe-connect protected refund preflight read contracts", () => {
        test("observes a refund committed after the request-id lookup", async () => {
            for (const interleaving of interleavings) {
                const fixture = await refundablePaymentFixture(createHarness);
                const aggregatePause = fixture.harness.rest.pauseNextPostgrestRead("refunds", 1);
                const pending = requestProtectedRefund(fixture);

                await aggregatePause.entered;
                fixture.harness.rest.seedSettlementLedgerRow("refunds", {
                    payment_id: fixture.paymentId,
                    refund_request_id: `concurrent-${interleaving.status}`,
                    amount: 100,
                    seller_entitlement_reduction_amount: interleaving.reduction,
                    status: interleaving.status,
                });
                aggregatePause.resume();

                const response = await pending;
                const body = await responseBody(response);

                expect(response.status).toBe(409);
                expect(body).toEqual({ error: interleaving.error });
                expect(JSON.stringify(body)).not.toContain("concurrent-");
                expect(fixture.harness.rest.stripeRequests).toEqual(expectedRefundPreflightRequests());
                expect(postgrestBudget(fixture.harness)).toEqual(preflightBudget);
                expect(fixture.harness.rest.refundCreateRequests).toHaveLength(0);
                expect(
                    fixture.harness.rest
                        .rows("financial_operations")
                        .filter((row) => row.operation_type === "refund_create"),
                ).toEqual([]);
                expect(fixture.harness.rest.moneyCallOrder).not.toContain("refund");
            }
        });
    });
}
