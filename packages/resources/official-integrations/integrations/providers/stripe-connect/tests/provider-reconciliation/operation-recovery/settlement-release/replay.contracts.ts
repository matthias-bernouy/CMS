import { describe, expect, test } from "bun:test";
import { expectedTransfer, providerReconciliationRequests } from "./fixtures";
import {
    type CreateSettlementReleaseHarness,
    createSettlementReleaseFixture,
    postgrestCalls,
    successfulJson,
} from "./harness";

export function registerSettlementReleaseReplayContracts(createHarness: CreateSettlementReleaseHarness): void {
    describe("stripe-connect settlement release replay contracts", () => {
        test("returns the exact succeeded Transfer without creating another financial side effect", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-succeeded-replay");
            await successfulJson(await fixture.release());
            const transfer = releaseTransfer(fixture);
            const operationCount = releaseOperationCount(fixture);
            fixture.resetRequests();

            const replayed = await successfulJson(await fixture.release());

            expect(replayed).toEqual(expectedTransfer(fixture, transfer));
            expect(postgrestCalls(fixture)).toEqual([
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
                ["POST", "rpc/read_provider_transfer_reconciliation_context"],
                ["PATCH", "transfers"],
                ["POST", "rpc/read_payment_reconciliation_local_context"],
                ["POST", "rpc/read_payment_reconciliation_ledger"],
                ["PATCH", "payments"],
                ["POST", "rpc/read_settlement_release_context"],
            ]);
            expect(stripeCalls(fixture)).toEqual(providerReconciliationRequests);
            expect(fixture.rest.stripeRequests.filter(({ method }) => method === "POST")).toEqual([]);
            expect(fixture.rest.rows("transfers")).toHaveLength(1);
            expect(releaseOperationCount(fixture)).toBe(operationCount);
        });
    });
}

function releaseTransfer(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>) {
    return fixture.rest
        .rows("transfers")
        .find((row) => row.release_authorization_id === fixture.releaseAuthorizationId)!;
}

function releaseOperationCount(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>): number {
    return fixture.rest.rows("financial_operations").filter((row) => row.operation_type === "transfer_create").length;
}

function stripeCalls(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>): Array<[string, string]> {
    return fixture.rest.stripeRequests.map(({ method, pathname }) => [method, pathname]);
}
