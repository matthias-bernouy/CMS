import { describe, expect, test } from "bun:test";
import { type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";
import { expectedRecovery, initialPayoutHoldRequests } from "./expectations";
import { initialReversalBudget, releasedTransferFixture, requestReversal } from "./harness";

const recoveredWriteBudget = [
    { method: "PATCH", table: "transfer_reversals" },
    { method: "PATCH", table: "financial_operations" },
    { method: "GET", table: "transfer_reversals" },
    { method: "PATCH", table: "transfers" },
    { method: "GET", table: "transfer_reversals" },
    { method: "PATCH", table: "transfer_recovery_requests" },
    { method: "GET", table: "transfer_reversals" },
    { method: "PATCH", table: "transfer_recovery_requests" },
    { method: "GET", table: "transfer_reversals" },
    { method: "GET", table: "payments" },
    { method: "PATCH", table: "payments" },
    { method: "POST", table: "rpc/upsert_seller_recovery_exposure_and_refresh" },
    { method: "POST", table: "rpc/claim_seller_payout_hold" },
];

export function registerTransferReversalRecoveryContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect direct transfer reversal recovery contracts", () => {
        test("retrieves an already-succeeded operation artifact without creating a reversal", async () => {
            const fixture = await releasedTransferFixture(createHarness);
            fixture.harness.rest.setNextTransferReversalScenario("operation-succeeded");

            const response = await requestReversal(fixture);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedRecovery(fixture, body, "trr_operation_succeeded"));
            expect(postgrestBudget(fixture.harness)).toEqual([...initialReversalBudget, ...recoveredWriteBudget]);
            expect(fixture.harness.rest.stripeRequests).toEqual([
                ...(await initialPayoutHoldRequests(fixture)),
                {
                    method: "GET",
                    pathname: `/v1/transfers/${fixture.transferId}/reversals/trr_operation_succeeded`,
                    searchParams: [],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
            ]);
            expect(fixture.harness.rest.transferReversalRequests).toEqual([]);
            expect(reversalOperation(fixture)).toMatchObject({
                status: "succeeded",
                stripe_object_id: "trr_operation_succeeded",
                attempt_count: 1,
            });
        });

        test("recovers a nonterminal operation from exact provider metadata without creating", async () => {
            const fixture = await releasedTransferFixture(createHarness);
            fixture.harness.rest.setNextTransferReversalScenario("metadata-match");

            const response = await requestReversal(fixture);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedRecovery(fixture, body, "trr_metadata_recovered"));
            expect(postgrestBudget(fixture.harness)).toEqual([...initialReversalBudget, ...recoveredWriteBudget]);
            expect(fixture.harness.rest.stripeRequests).toEqual([
                ...(await initialPayoutHoldRequests(fixture)),
                {
                    method: "GET",
                    pathname: `/v1/transfers/${fixture.transferId}/reversals`,
                    searchParams: [["limit", "100"]],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
            ]);
            expect(fixture.harness.rest.transferReversalRequests).toEqual([]);
            expect(reversalOperation(fixture)).toMatchObject({
                status: "succeeded",
                stripe_object_id: "trr_metadata_recovered",
                attempt_count: 1,
            });
            expect(fixture.harness.rest.rows("transfer_reversals")).toHaveLength(1);
        });
    });
}

function reversalOperation(fixture: Awaited<ReturnType<typeof releasedTransferFixture>>) {
    return fixture.harness.rest
        .rows("financial_operations")
        .find((row) => row.operation_type === "transfer_reversal_create");
}
