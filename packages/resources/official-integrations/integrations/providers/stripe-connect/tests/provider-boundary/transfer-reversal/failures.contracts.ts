import { describe, expect, test } from "bun:test";
import { type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";
import { initialPayoutHoldRequests, payoutHoldReadRequest, reversalIdempotencyKey } from "./expectations";
import {
    initialReversalBudget,
    releasedTransferFixture,
    requestReversal,
    type TransferReversalFixture,
    type TransferReversalScenario,
} from "./harness";

const manualReviewBudget = [
    { method: "PATCH", table: "transfer_reversals" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/mark_payment_manual_review" },
    { method: "POST", table: "provider_exceptions" },
    { method: "GET", table: "transfer_reversals" },
    { method: "PATCH", table: "transfer_recovery_requests" },
    { method: "POST", table: "rpc/upsert_seller_recovery_exposure_and_refresh" },
    { method: "POST", table: "provider_exceptions" },
    { method: "POST", table: "rpc/claim_seller_payout_hold" },
    { method: "POST", table: "rpc/reserve_account_financial_operation" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/complete_seller_payout_hold" },
];

export function registerTransferReversalFailureContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect direct transfer reversal failure contracts", () => {
        test("moves no-match, ambiguous, and incomplete provider searches to exact manual review", async () => {
            const cases: Array<{ scenario: TransferReversalScenario; error: string }> = [
                {
                    scenario: "manual-review-no-match",
                    error: "Transfer Reversal outcome is unresolved and requires finance review",
                },
                { scenario: "ambiguous", error: "Stripe Transfer Reversal search is ambiguous" },
                { scenario: "has-more", error: "Stripe Transfer Reversal search is ambiguous" },
            ];
            for (const item of cases) {
                const fixture = await releasedTransferFixture(createHarness);
                fixture.harness.rest.setNextTransferReversalScenario(item.scenario);

                const response = await requestReversal(fixture);

                expect(response.status).toBe(409);
                expect(await responseBody(response)).toEqual({ error: item.error });
                expect(postgrestBudget(fixture.harness)).toEqual([...initialReversalBudget, ...manualReviewBudget]);
                expect(fixture.harness.rest.stripeRequests).toEqual([
                    ...(await initialPayoutHoldRequests(fixture)),
                    {
                        method: "GET",
                        pathname: `/v1/transfers/${fixture.transferId}/reversals`,
                        searchParams: [["limit", "100"]],
                        idempotencyKey: null,
                        stripeAccount: null,
                    },
                    payoutHoldReadRequest(fixture),
                ]);
                expect(fixture.harness.rest.transferReversalRequests).toEqual([]);
                assertManualReview(fixture, item.error);
            }
        });

        test("preserves exact local effects when Stripe reversal creation fails", async () => {
            const fixture = await releasedTransferFixture(createHarness);
            fixture.harness.rest.rejectTransferReversals();

            const response = await requestReversal(fixture);
            const operation = reversalOperation(fixture);
            const idempotencyKey = await reversalIdempotencyKey(String(operation.business_key));
            const error = "connected account balance is unavailable";

            expect(response.status).toBe(502);
            expect(await responseBody(response)).toEqual({ error: "provider request failed" });
            expect(postgrestBudget(fixture.harness)).toEqual([
                ...initialReversalBudget,
                { method: "PATCH", table: "financial_operations" },
                { method: "PATCH", table: "transfer_reversals" },
                ...manualReviewBudget,
            ]);
            expect(fixture.harness.rest.stripeRequests).toEqual([
                ...(await initialPayoutHoldRequests(fixture)),
                {
                    method: "POST",
                    pathname: `/v1/transfers/${fixture.transferId}/reversals`,
                    searchParams: [],
                    idempotencyKey,
                    stripeAccount: null,
                },
                payoutHoldReadRequest(fixture),
            ]);
            expect(fixture.harness.rest.transferReversalRequests).toEqual([
                {
                    transferId: fixture.transferId,
                    parameters: [
                        ["amount", "1080"],
                        ["metadata[operation_key]", operation.business_key],
                    ],
                    idempotencyKey,
                },
            ]);
            assertManualReview(fixture, error);
        });
    });
}

function assertManualReview(fixture: TransferReversalFixture, error: string): void {
    const operation = reversalOperation(fixture);
    expect(fixture.harness.rest.rows("transfer_recovery_requests")).toEqual([
        expect.objectContaining({ status: "manual_review", confirmed_amount: 0, last_error: error }),
    ]);
    expect(fixture.harness.rest.rows("transfer_reversals")).toEqual([
        expect.objectContaining({ status: "manual_review", provider_snapshot: { error } }),
    ]);
    expect(reversalOperation(fixture)).toMatchObject({ status: "manual_review", last_error: error, attempt_count: 1 });
    expect(fixture.harness.rest.rows("payments")[0]).toMatchObject({
        settlement_status: "manual_review",
        manual_review_reason: error,
    });
    expect(fixture.harness.rest.rows("provider_exceptions")).toEqual([
        expect.objectContaining({
            payment_id: fixture.paymentId,
            operation_id: operation.id,
            exception_type: "transfer_reversal_ambiguous",
            severity: "critical",
            message: error,
            details: {
                businessKey: operation.business_key,
                operationType: "transfer_reversal_create",
            },
        }),
        expect.objectContaining({
            payment_id: fixture.paymentId,
            deduplication_key: "seller-debt:direct-reversal-1",
            exception_type: "seller_recovery_debt",
            severity: "critical",
            message: "Stripe could not confirm recovery of transferred seller funds",
            resolved_at: null,
            resolved_by: null,
            details: {
                recoveryKey: "direct-reversal-1",
                amount: 1080,
                sellerUserId: "seller-1",
                recoveryRequestId: "direct-reversal-1",
                confirmedAmount: 0,
                error,
            },
        }),
    ]);
}

function reversalOperation(fixture: TransferReversalFixture) {
    return fixture.harness.rest
        .rows("financial_operations")
        .find((row) => row.operation_type === "transfer_reversal_create")!;
}
