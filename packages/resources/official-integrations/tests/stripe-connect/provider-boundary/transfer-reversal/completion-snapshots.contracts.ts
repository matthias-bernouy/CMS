import { describe, expect, test } from "bun:test";
import {
    type CreateProviderBoundaryHarness,
    postgrestBudget,
    type ProviderBoundaryHarness,
    responseBody,
} from "../harness";
import { expectedRecovery, initialPayoutHoldRequests, reversalIdempotencyKey } from "./expectations";
import {
    expectTransferReversalCompletionReads,
    initialReversalBudget,
    releasedTransferFixture,
    requestReversal,
    successfulReversalWriteBudget,
} from "./harness";

const missingPaymentRecoveryBudget = [
    { method: "GET", table: "transfer_reversals" },
    { method: "PATCH", table: "transfer_recovery_requests" },
    { method: "POST", table: "rpc/upsert_seller_recovery_exposure_and_refresh" },
    { method: "POST", table: "provider_exceptions" },
    { method: "POST", table: "rpc/claim_seller_payout_hold" },
];
export function registerTransferReversalCompletionSnapshotContracts(
    createHarness: CreateProviderBoundaryHarness,
): void {
    describe("stripe-connect transfer reversal completion snapshot contracts", () => {
        test("keeps the succeeded-only reversal sum before the later payment snapshot", async () => {
            const fixture = await releasedTransferFixture(createHarness);
            const reversalPause = fixture.harness.rest.pauseNextPostgrestRead("transfer_reversals", 3);
            const pending = requestReversal(fixture);
            await reversalPause.entered;
            seedReversal(fixture, "succeeded", 20);
            for (const [status, amount] of excludedStatuses) {
                seedReversal(fixture, status, amount);
            }
            const paymentPause = fixture.harness.rest.pauseNextPostgrestRead("payments");
            reversalPause.resume();
            await paymentPause.entered;
            seedReversal(fixture, "succeeded", 30);
            fixture.harness.rest.patchPaymentLedger(fixture.paymentId, {
                transferred_amount: 1200,
                settlement_status: "refund_pending",
            });
            paymentPause.resume();
            const response = await pending;
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedRecovery(fixture, body, "trr_1"));
            expect(fixture.harness.rest.rows("payments")[0]).toMatchObject({
                transferred_amount: 1200,
                reversed_amount: 1100,
                settlement_status: "refund_pending",
            });
            expect(postgrestBudget(fixture.harness)).toEqual([
                ...initialReversalBudget,
                ...successfulReversalWriteBudget,
            ]);
            expectTransferReversalCompletionReads(fixture.harness, fixture.paymentId);
            await expectProviderCalls(fixture);
        });

        test("returns the exact error when the payment is absent after the reversal sum", async () => {
            const fixture = await releasedTransferFixture(createHarness);
            const reversalPause = fixture.harness.rest.pauseNextPostgrestRead("transfer_reversals", 3);
            const pending = requestReversal(fixture);

            await reversalPause.entered;
            fixture.harness.rest.omitNextPaymentRead();
            reversalPause.resume();
            const response = await pending;

            expect(response.status).toBe(404);
            expect(await responseBody(response)).toEqual({ error: "payment not found" });
            expect(postgrestBudget(fixture.harness)).toEqual([
                ...initialReversalBudget,
                ...successfulReversalWriteBudget.slice(0, 11),
                ...missingPaymentRecoveryBudget,
            ]);
            expectMissingPaymentContextOrder(fixture.harness.rest.postgrestRequests, fixture.paymentId);
            expect(fixture.harness.rest.rows("payments")[0]).toMatchObject({
                reversed_amount: 0,
                settlement_status: "released",
            });
            expect(fixture.harness.rest.rows("transfer_recovery_requests")[0]).toMatchObject({
                confirmed_amount: 1080,
                status: "manual_review",
                last_error: "payment not found",
            });
            await expectProviderCalls(fixture);
        });
    });
}

const excludedStatuses = [
    ["reserved", 100],
    ["processing", 200],
    ["failed", 300],
    ["manual_review", 400],
] as const;

function seedReversal(
    fixture: Awaited<ReturnType<typeof releasedTransferFixture>>,
    status: "reserved" | "processing" | "succeeded" | "failed" | "manual_review",
    amount: number,
): void {
    fixture.harness.rest.seedSettlementLedgerRow("transfer_reversals", {
        payment_id: fixture.paymentId,
        reversal_request_id: `completion-${status}-${amount}`,
        amount,
        currency: "eur",
        status,
    });
}

function expectMissingPaymentContextOrder(
    requests: ProviderBoundaryHarness["rest"]["postgrestRequests"],
    paymentId: number,
): void {
    const contextRead = requests.findLastIndex(
        ({ table }) => table === "rpc/read_transfer_reversal_completion_context",
    );
    expect(requests[contextRead]?.body).toEqual({ p_payment_id: paymentId });
    expect(
        requests.slice(contextRead + 1).some(({ method, table }) => method === "PATCH" && table === "payments"),
    ).toBe(false);
}

async function expectProviderCalls(fixture: Awaited<ReturnType<typeof releasedTransferFixture>>): Promise<void> {
    const operation = fixture.harness.rest
        .rows("financial_operations")
        .find((row) => row.operation_type === "transfer_reversal_create")!;
    expect(fixture.harness.rest.stripeRequests).toEqual([
        ...(await initialPayoutHoldRequests(fixture)),
        {
            method: "POST",
            pathname: `/v1/transfers/${fixture.transferId}/reversals`,
            searchParams: [],
            idempotencyKey: await reversalIdempotencyKey(String(operation.business_key)),
            stripeAccount: null,
        },
    ]);
}
