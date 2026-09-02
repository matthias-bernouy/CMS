import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";
import { expectedRefundPreflightRequests } from "./expectations";
import { assertNoRefundMoneyMovement, refundablePaymentFixture, requestProtectedRefund } from "./harness";

const validationBudget = [
    { method: "GET", table: "payments" },
    { method: "POST", table: "rpc/apply_payment_provider_projection" },
    { method: "POST", table: "rpc/read_payment_reconciliation_local_context" },
    { method: "POST", table: "rpc/read_payment_reconciliation_ledger" },
    { method: "PATCH", table: "payments" },
];

const pendingConflictBudget = [
    { method: "GET", table: "payments" },
    { method: "POST", table: "rpc/apply_payment_provider_projection" },
    { method: "GET", table: "refunds" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/enqueue_commerce_refund_projection" },
    { method: "POST", table: "rpc/read_refund_projection_context" },
    { method: "PATCH", table: "payments" },
    { method: "POST", table: "rpc/read_payment_reconciliation_local_context" },
    { method: "PATCH", table: "refunds" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/enqueue_commerce_refund_projection" },
    { method: "POST", table: "rpc/read_refund_projection_context" },
    { method: "PATCH", table: "payments" },
    { method: "POST", table: "rpc/read_payment_reconciliation_ledger" },
    { method: "PATCH", table: "payments" },
    { method: "POST", table: "rpc/read_refund_preflight_context" },
];

const validationCases = [
    {
        patch: { sellerEntitlementReductionAmount: -1 },
        status: 400,
        error: "sellerEntitlementReductionAmount must be between zero and the refund amount",
        budget: validationBudget,
    },
    {
        patch: { sellerEntitlementReductionAmount: 301 },
        status: 400,
        error: "sellerEntitlementReductionAmount must be between zero and the refund amount",
        budget: validationBudget,
    },
    {
        patch: { authorizedSellerAmount: 1081 },
        status: 400,
        error: "authorizedSellerAmount is invalid",
        budget: validationBudget,
    },
    {
        patch: { authorizedSellerAmount: 779 },
        status: 409,
        error: "refund seller entitlement target is stale or invalid",
        budget: [...validationBudget, { method: "POST", table: "rpc/read_refund_preflight_context" }],
    },
    {
        patch: { amount: 1300, authorizedSellerAmount: 0, sellerEntitlementReductionAmount: 1080 },
        status: 409,
        error: "refund exceeds the remaining captured amount",
        budget: [
            ...validationBudget,
            { method: "POST", table: "rpc/read_refund_preflight_context" },
            { method: "GET", table: "transfer_recovery_requests" },
            { method: "GET", table: "refunds" },
        ],
    },
];

export function registerProtectedRefundValidationContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected refund validation contracts", () => {
        test("keeps entitlement, stale-target, and captured-amount gates before refund writes", async () => {
            for (const validationCase of validationCases) {
                const fixture = await refundablePaymentFixture(createHarness);

                const response = await requestProtectedRefund(fixture, validationCase.patch);
                const body = await responseBody(response);

                expect(response.status).toBe(validationCase.status);
                expect(body).toEqual({ error: validationCase.error });
                expect(JSON.stringify(body)).not.toContain("ch_1");
                expect(fixture.harness.rest.stripeRequests).toEqual(expectedRefundPreflightRequests());
                expect(postgrestBudget(fixture.harness)).toEqual(validationCase.budget);
                assertNoRefundMoneyMovement(fixture);
            }
        });

        test("blocks a second refund while the first provider outcome remains nonterminal", async () => {
            const fixture = await refundablePaymentFixture(createHarness);
            fixture.harness.rest.setNextRefundStatus("pending");
            expect((await requestProtectedRefund(fixture)).status).toBe(200);
            clearRequests(fixture.harness);

            const response = await requestProtectedRefund(fixture, {
                refundRequestId: "protected-refund-2",
                commerceRefundRequestId: 702,
                authorizedSellerAmount: 480,
            });
            const body = await responseBody(response);

            expect(response.status).toBe(409);
            expect(body).toEqual({ error: "another refund is awaiting terminal provider confirmation" });
            expect(JSON.stringify(body)).not.toContain("protected-refund-1");
            expect(fixture.harness.rest.stripeRequests).toEqual([
                ...expectedRefundPreflightRequests(),
                {
                    method: "GET",
                    pathname: "/v1/refunds/re_1",
                    searchParams: [],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
            ]);
            expect(postgrestBudget(fixture.harness)).toEqual(pendingConflictBudget);
            expect(fixture.harness.rest.refundCreateRequests).toHaveLength(1);
            expect(fixture.harness.rest.rows("refunds")).toHaveLength(1);
        });
    });
}
