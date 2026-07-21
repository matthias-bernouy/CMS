import { describe, expect, test } from "bun:test";
import {
    createTerminalPageFixture,
    postgrestCalls,
    successfulJson,
    type CreateProviderReconciliationHarness,
} from "./harness";

export function registerProviderReconciliationBudgets(createHarness: CreateProviderReconciliationHarness): void {
    describe("stripe-connect provider reconciliation query budgets", () => {
        test("hydrates every terminal projection kind with two fixed RPCs", async () => {
            const fixture = await createTerminalPageFixture(createHarness, "terminal-page-budget");
            for (let index = 0; index < 4; index++) {
                fixture.rest.seedPaymentProjection(fixture.seed.paymentId, `terminal:payment:additional:${index}`);
            }

            const result = await successfulJson(await fixture.run(fixture.seed.runKey, 10));

            expect(result.payments).toHaveLength(5);
            expect(result.commerceOperations).toHaveLength(1);
            expect(result.disputes).toHaveLength(1);
            const calls = postgrestCalls(fixture);
            expect(calls).toEqual([
                ["GET", "reconciliation_runs"],
                ["POST", "rpc/read_reconciliation_operations"],
                ["POST", "rpc/claim_reconciliation_projection_batch"],
            ]);
            expect(fixture.rest.stripeRequests).toEqual([]);
        });
    });
}
