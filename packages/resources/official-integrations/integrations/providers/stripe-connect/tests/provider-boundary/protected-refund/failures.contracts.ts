import { describe, expect, test } from "bun:test";
import {
    clearRequests,
    type CreateProviderBoundaryHarness,
    type ProtectedRefundSearchScenario,
    postgrestBudget,
    responseBody,
} from "../harness";
import { expectedRefundListRequest, expectedRefundPreflightRequests } from "./expectations";
import { refundablePaymentFixture, refundOperation, requestProtectedRefund } from "./harness";

type FailureCase = {
    scenario: ProtectedRefundSearchScenario;
    error: string;
};

const failureCases: FailureCase[] = [
    {
        scenario: "no-match",
        error: "Refund outcome is unresolved and requires finance review",
    },
    { scenario: "ambiguous", error: "Stripe Refund search is ambiguous" },
    { scenario: "has-more", error: "Stripe Refund search is ambiguous" },
];

const failureBudget = [
    { method: "GET", table: "payments" },
    { method: "POST", table: "rpc/apply_payment_provider_projection" },
    { method: "GET", table: "refunds" },
    { method: "POST", table: "rpc/mark_payment_manual_review" },
    { method: "POST", table: "provider_exceptions" },
    { method: "POST", table: "rpc/read_payment_reconciliation_local_context" },
    { method: "POST", table: "rpc/read_payment_reconciliation_ledger" },
    { method: "PATCH", table: "payments" },
    { method: "POST", table: "rpc/read_refund_preflight_context" },
    { method: "GET", table: "transfer_recovery_requests" },
    { method: "GET", table: "refunds" },
    { method: "POST", table: "rpc/reserve_financial_operation" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/mark_payment_manual_review" },
    { method: "POST", table: "provider_exceptions" },
];

export function registerProtectedRefundFailureContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected refund recovery failures", () => {
        test("keeps zero, ambiguous, and incomplete searches in manual review without creating twice", async () => {
            for (const failureCase of failureCases) {
                const fixture = await refundablePaymentFixture(createHarness);
                fixture.harness.rest.loseNextRefundCreationResponse();
                expect((await requestProtectedRefund(fixture)).status).toBe(500);
                clearRequests(fixture.harness);
                fixture.harness.rest.setNextRefundSearchScenario(failureCase.scenario);

                const response = await requestProtectedRefund(fixture);
                const body = await responseBody(response);

                expect(response.status).toBe(409);
                expect(body).toEqual({ error: failureCase.error });
                expect(JSON.stringify(body)).not.toContain("ch_1");
                expect(JSON.stringify(body)).not.toContain("protected-refund-1");
                expect(fixture.harness.rest.stripeRequests).toEqual([
                    ...expectedRefundPreflightRequests(),
                    expectedRefundListRequest(),
                ]);
                expect(postgrestBudget(fixture.harness)).toEqual(failureBudget);
                expect(fixture.harness.rest.refundCreateRequests).toHaveLength(1);
                expect(fixture.harness.rest.rows("refunds")).toEqual([
                    expect.objectContaining({
                        refund_request_id: "protected-refund-1",
                        stripe_refund_id: null,
                        status: "processing",
                    }),
                ]);
                expect(refundOperation(fixture)).toMatchObject({
                    status: "manual_review",
                    stripe_object_id: null,
                    attempt_count: 1,
                    last_error: failureCase.error,
                });
                expect(fixture.harness.rest.rows("provider_exceptions")).toContainEqual(
                    expect.objectContaining({
                        exception_type: "refund_create_ambiguous",
                        severity: "critical",
                        message: failureCase.error,
                    }),
                );
            }
        });
    });
}
