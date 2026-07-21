import { describe, expect, test } from "bun:test";
import {
    createTerminalPageFixture,
    postgrestCalls,
    successfulJson,
    terminalPageBaselineDbCalls,
    type CreateProviderReconciliationHarness,
} from "./harness";

export function registerProviderReconciliationBudgets(
    createHarness: CreateProviderReconciliationHarness,
): void {
    describe("stripe-connect provider reconciliation query budgets", () => {
        test("documents the terminal multi-kind hydration baseline", async () => {
            const fixture = await createTerminalPageFixture(createHarness, "terminal-page-budget");

            await successfulJson(await fixture.run(fixture.seed.runKey, 10));

            const calls = postgrestCalls(fixture);
            expect(calls).toHaveLength(terminalPageBaselineDbCalls({
                operationsWithPayment: 1,
                paymentProjections: 1,
                operationProjections: 1,
                disputeProjections: 1,
            }));
            expect(calls).toEqual([
                ["GET", "reconciliation_runs"],
                ["GET", "financial_operations"],
                ["GET", "payments"],
                ["POST", "rpc/claim_commerce_projection_outbox"],
                ["GET", "payments"],
                ["GET", "financial_operations"],
                ["GET", "stripe_disputes"],
                ["GET", "payments"],
                ["GET", "payments"],
                ["GET", "stripe_dispute_evidence"],
                ["GET", "irreversible_dispute_action_approvals"],
            ]);
            expect(fixture.rest.stripeRequests).toEqual([]);
        });
    });
}
