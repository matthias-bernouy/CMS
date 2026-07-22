import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";
import { expectedRecovery, initialPayoutHoldRequests, reversalIdempotencyKey } from "./expectations";
import { initialReversalBudget, releasedTransferFixture, replayReversalBudget, requestReversal } from "./harness";

const successfulWriteBudget = [
    { method: "PATCH", table: "financial_operations" },
    { method: "PATCH", table: "transfer_reversals" },
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

export function registerTransferReversalSuccessContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect direct transfer reversal contracts", () => {
        test("creates one exact reversal and replays it without provider or row duplication", async () => {
            const fixture = await releasedTransferFixture(createHarness);

            const response = await requestReversal(fixture);
            const body = await responseBody(response);
            const operation = reversalOperations(fixture.harness)[0]!;
            const idempotencyKey = await reversalIdempotencyKey(String(operation.business_key));

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedRecovery(fixture, body, "trr_1"));
            expect(postgrestBudget(fixture.harness)).toEqual([...initialReversalBudget, ...successfulWriteBudget]);
            expect(fixture.harness.rest.stripeRequests).toEqual([
                ...(await initialPayoutHoldRequests(fixture)),
                {
                    method: "POST",
                    pathname: `/v1/transfers/${fixture.transferId}/reversals`,
                    searchParams: [],
                    idempotencyKey,
                    stripeAccount: null,
                },
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

            clearRequests(fixture.harness);
            const replay = await requestReversal(fixture);
            const replayBody = await responseBody(replay);

            expect(replay.status).toBe(200);
            expect(replayBody).toEqual(expectedRecovery(fixture, replayBody, "trr_1"));
            expect(postgrestBudget(fixture.harness)).toEqual([
                ...replayReversalBudget,
                ...successfulWriteBudget.slice(6),
            ]);
            expect(fixture.harness.rest.stripeRequests).toEqual([]);
            expect(fixture.harness.rest.transferReversalRequests).toHaveLength(1);
            expect(fixture.harness.rest.rows("transfer_recovery_requests")).toHaveLength(1);
            expect(fixture.harness.rest.rows("transfer_reversals")).toHaveLength(1);
            expect(reversalOperations(fixture.harness)).toHaveLength(1);
        });

        test("distinguishes immutable replay mismatch from the historical reason conflict", async () => {
            const fixture = await releasedTransferFixture(createHarness);
            expect((await requestReversal(fixture)).status).toBe(200);
            const rows = fixture.harness.rest.rows("transfer_reversals");
            clearRequests(fixture.harness);

            const immutable = await requestReversal(fixture, { amount: 1079 });
            expect(immutable.status).toBe(409);
            expect(await responseBody(immutable)).toEqual({ error: "Transfer recovery request replay mismatch" });
            expect(postgrestBudget(fixture.harness)).toEqual(initialReversalBudget.slice(0, 2));
            expect(fixture.harness.rest.stripeRequests).toEqual([]);

            clearRequests(fixture.harness);
            const historicalReason = await requestReversal(fixture, { reason: "different historical reason" });
            expect(historicalReason.status).toBe(409);
            expect(await responseBody(historicalReason)).toEqual({ error: "transfer recovery replay mismatch" });
            expect(postgrestBudget(fixture.harness)).toEqual(replayReversalBudget);
            expect(fixture.harness.rest.stripeRequests).toEqual([]);
            expect(fixture.harness.rest.rows("transfer_reversals")).toEqual(rows);
            expect(reversalOperations(fixture.harness)).toHaveLength(1);
        });

        test("rejects nonpositive and above-net amounts before reservation or provider access", async () => {
            const fixture = await releasedTransferFixture(createHarness);
            for (const amount of [0, -1, 1081]) {
                clearRequests(fixture.harness);
                const response = await requestReversal(fixture, { amount });
                expect(response.status).toBe(409);
                expect(await responseBody(response)).toEqual({ error: "reversal exceeds the net transferred amount" });
                expect(postgrestBudget(fixture.harness)).toEqual(initialReversalBudget.slice(0, 2));
                expect(fixture.harness.rest.stripeRequests).toEqual([]);
                expect(fixture.harness.rest.rows("transfer_recovery_requests")).toEqual([]);
                expect(fixture.harness.rest.rows("transfer_reversals")).toEqual([]);
            }
        });
    });
}

function reversalOperations(harness: { rest: { rows(table: string): Array<Record<string, unknown>> } }) {
    return harness.rest.rows("financial_operations").filter((row) => row.operation_type === "transfer_reversal_create");
}
