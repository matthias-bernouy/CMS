import { describe, expect, test } from "bun:test";
import { expectedTransfer, providerReconciliationRequests, successfulSettlementDatabaseCalls } from "./fixtures";
import {
    type CreateSettlementReleaseHarness,
    createSettlementReleaseFixture,
    postgrestCalls,
    successfulJson,
} from "./harness";

export function registerSettlementReleaseLedgerFreshnessContracts(createHarness: CreateSettlementReleaseHarness): void {
    describe("stripe-connect settlement release final ledger freshness contracts", () => {
        test("includes a concurrent succeeded Transfer in the final transferred amount", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-final-transfers");
            const pause = fixture.rest.pauseNextPostgrestRead("transfers", 1);
            fixture.resetRequests();

            const pending = fixture.release({ amount: 1000 });
            await pause.entered;
            fixture.rest.seedSettlementLedgerRow("transfers", concurrentTransfer(fixture, 80));
            pause.resume();
            const response = await successfulJson(await pending);
            const transfer = releaseTransfer(fixture);

            expect(response).toEqual(expectedTransfer(fixture, transfer, 1000));
            expect(fixture.rest.rows("payments")[0]).toMatchObject({
                transferred_amount: 1080,
                settlement_status: "released",
            });
            expectCurrentSuccessBudgets(fixture);
        });

        test("includes a concurrent succeeded reversal in the final net settlement", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-final-reversals");
            const pause = fixture.rest.pauseNextPostgrestRead("transfer_reversals");
            fixture.resetRequests();

            const pending = fixture.release();
            await pause.entered;
            const transfer = releaseTransfer(fixture);
            fixture.rest.seedSettlementLedgerRow("transfer_reversals", concurrentReversal(fixture, transfer, 100));
            pause.resume();
            const response = await successfulJson(await pending);

            expect(response).toEqual(expectedTransfer(fixture, transfer));
            expect(fixture.rest.rows("payments")[0]).toMatchObject({
                transferred_amount: 1080,
                settlement_status: "held",
            });
            expectCurrentSuccessBudgets(fixture);
        });

        test("includes a concurrent refund in the final seller entitlement", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-final-refunds");
            const pause = fixture.rest.pauseNextPostgrestRead("refunds", 1);
            fixture.resetRequests();

            const pending = fixture.release({ amount: 1000 });
            await pause.entered;
            fixture.rest.seedSettlementLedgerRow("refunds", concurrentRefund(fixture.paymentId, 100));
            pause.resume();
            const response = await successfulJson(await pending);
            const transfer = releaseTransfer(fixture);

            expect(response).toEqual(expectedTransfer(fixture, transfer, 1000));
            expect(fixture.rest.rows("payments")[0]).toMatchObject({
                transferred_amount: 1000,
                settlement_status: "released",
            });
            expectCurrentSuccessBudgets(fixture);
        });
    });
}

function expectCurrentSuccessBudgets(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>): void {
    expect(postgrestCalls(fixture)).toEqual(successfulSettlementDatabaseCalls);
    expect(fixture.rest.stripeRequests.map(({ method, pathname }) => [method, pathname])).toEqual([
        ...providerReconciliationRequests,
        ["POST", "/v1/transfers"],
    ]);
}

function releaseTransfer(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>) {
    return fixture.rest
        .rows("transfers")
        .find((row) => row.release_authorization_id === fixture.releaseAuthorizationId)!;
}

function concurrentTransfer(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>, amount: number) {
    return {
        payment_id: fixture.paymentId,
        operation_id: 998,
        release_authorization_id: `${fixture.releaseAuthorizationId}-concurrent`,
        release_kind: "reserve",
        stripe_transfer_id: `tr_concurrent_${fixture.paymentId}`,
        source_charge_id: fixture.chargeId,
        destination_account_id: fixture.accountId,
        transfer_group: fixture.transferGroup,
        amount,
        currency: "eur",
        status: "succeeded",
        provider_snapshot: null,
    };
}

function concurrentReversal(
    fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>,
    transfer: Record<string, unknown>,
    amount: number,
) {
    return {
        payment_id: fixture.paymentId,
        transfer_id: transfer.id,
        operation_id: 997,
        reversal_request_id: `${fixture.releaseAuthorizationId}-concurrent-reversal`,
        amount,
        currency: "eur",
        status: "succeeded",
    };
}

function concurrentRefund(paymentId: number, reduction: number) {
    return {
        payment_id: paymentId,
        refund_request_id: `seed-final-refund-${paymentId}`,
        amount: reduction,
        seller_entitlement_reduction_amount: reduction,
        currency: "eur",
        status: "succeeded",
    };
}
