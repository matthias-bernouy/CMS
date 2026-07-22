import { describe, expect, test } from "bun:test";
import { providerReconciliationRequests } from "./fixtures";
import {
    type CreateSettlementReleaseHarness,
    createSettlementReleaseFixture,
    postgrestCalls,
    responseJson,
    successfulJson,
} from "./harness";

export function registerSettlementReleaseValidationContracts(createHarness: CreateSettlementReleaseHarness): void {
    describe("stripe-connect settlement release validation contracts", () => {
        test("rejects a replay whose immutable transfer terms changed", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-replay-mismatch");
            await successfulJson(await fixture.release());
            fixture.resetRequests();

            const response = await fixture.release({ amount: 1079 });

            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({ error: "settlement release replay mismatch" });
            expect(stripeCalls(fixture)).toEqual(providerReconciliationRequests);
            expect(postgrestCalls(fixture)).toEqual([
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
                ["POST", "rpc/read_provider_transfer_reconciliation_context"],
                ["PATCH", "transfers"],
                ["POST", "rpc/read_payment_reconciliation_local_context"],
                ["POST", "rpc/read_payment_reconciliation_ledger"],
                ["PATCH", "payments"],
                ["GET", "accounts"],
                ["GET", "transfers"],
            ]);
            expect(fixture.rest.rows("transfers")).toHaveLength(1);
            expect(
                fixture.rest.rows("financial_operations").filter((row) => row.operation_type === "transfer_create"),
            ).toHaveLength(1);
        });

        test("fails before transfer reservation when the seller account disappeared", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-missing-account");
            fixture.rest.removeAccount(fixture.sellerUserId);
            fixture.resetRequests();

            const response = await fixture.release();

            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({
                error: "seller financial risk blocks settlement release",
            });
            expect(stripeCalls(fixture)).toEqual(providerReconciliationRequests);
            expect(postgrestCalls(fixture)).toEqual(commonValidationReads());
            expectNoReleaseMutation(fixture);
        });

        test("rejects a release currency different from immutable payment truth", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-currency-mismatch");
            fixture.resetRequests();

            const response = await fixture.release({ currency: "usd" });

            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({ error: "release currency mismatch" });
            expect(stripeCalls(fixture)).toEqual(providerReconciliationRequests);
            expect(postgrestCalls(fixture)).toEqual(commonValidationReads());
            expectNoReleaseMutation(fixture);
        });

        test("rejects an amount beyond the authorized seller entitlement", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-amount-mismatch");
            fixture.resetRequests();

            const response = await fixture.release({ amount: 1081 });

            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({
                error: "release exceeds the authorized seller transfer amount",
            });
            expect(stripeCalls(fixture)).toEqual(providerReconciliationRequests);
            expect(postgrestCalls(fixture)).toEqual([
                ...commonValidationReads(),
                ["GET", "transfers"],
                ["GET", "refunds"],
            ]);
            expectNoReleaseMutation(fixture);
        });
    });
}

function commonValidationReads(): Array<[string, string]> {
    return [
        ["GET", "payments"],
        ["POST", "rpc/apply_payment_provider_projection"],
        ["POST", "rpc/read_payment_reconciliation_local_context"],
        ["POST", "rpc/read_payment_reconciliation_ledger"],
        ["PATCH", "payments"],
        ["GET", "accounts"],
    ];
}

function stripeCalls(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>): Array<[string, string]> {
    return fixture.rest.stripeRequests.map(({ method, pathname }) => [method, pathname]);
}

function expectNoReleaseMutation(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>): void {
    expect(fixture.rest.rows("transfers")).toEqual([]);
    expect(fixture.rest.rows("financial_operations").filter((row) => row.operation_type === "transfer_create")).toEqual(
        [],
    );
}
