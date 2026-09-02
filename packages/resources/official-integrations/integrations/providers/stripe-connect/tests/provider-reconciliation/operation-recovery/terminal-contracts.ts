import { describe, expect, test } from "bun:test";
import { successfulJson, type CreateProviderReconciliationHarness, type OperationRecoveryKind } from "../harness";

const cases = [
    { kind: "transfer", table: "transfers", operationStatus: "succeeded" },
    { kind: "reversal", table: "transfer_reversals", operationStatus: "succeeded" },
    { kind: "refund", table: "refunds", operationStatus: "processing" },
] as const;

export function registerTerminalOperationRecoveryContracts(createHarness: CreateProviderReconciliationHarness): void {
    describe("stripe-connect terminal financial operation recovery contracts", () => {
        for (const recoveryCase of cases) {
            test(`recovers a terminal ${recoveryCase.kind} without a money provider call`, async () => {
                const harness = await createHarness();
                const seed = harness.rest.seedTerminalOperationRecovery(recoveryCase.kind as OperationRecoveryKind);
                harness.rest.clearPostgrestRequests();
                harness.rest.clearStripeRequests();

                const result = await successfulJson(
                    await harness.run(`terminal-${recoveryCase.kind}-operation-recovery`, 1),
                );

                expect(result).toMatchObject({
                    status: "succeeded",
                    scannedCount: 1,
                    repairedCount: 1,
                    exceptionCount: 0,
                    details: {
                        recoveredFinancialOperations: 1,
                        reconciledStalePayments: 0,
                        workBudgetLimit: 1,
                        workBudgetConsumed: 1,
                    },
                });
                expect(
                    harness.rest.rows("financial_operations").find((row) => row.id === seed.operationId),
                ).toMatchObject({
                    status: recoveryCase.operationStatus,
                    stripe_object_id: seed.providerObjectId,
                    response: {
                        id: seed.providerObjectId,
                        status: recoveryCase.operationStatus === "processing" ? "pending" : "succeeded",
                    },
                    last_error: null,
                    attempt_count: 2,
                    completed_at:
                        recoveryCase.operationStatus === "processing"
                            ? null
                            : expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
                });
                expect(harness.rest.rows(recoveryCase.table).find((row) => row.id === seed.artifactId)).toMatchObject({
                    ...(recoveryCase.kind === "transfer" ? { stripe_transfer_id: seed.providerObjectId } : {}),
                    ...(recoveryCase.kind === "reversal" ? { stripe_transfer_reversal_id: seed.providerObjectId } : {}),
                    ...(recoveryCase.kind === "refund" ? { stripe_refund_id: seed.providerObjectId } : {}),
                    status: recoveryCase.kind === "refund" ? "pending" : "succeeded",
                });
                expect(harness.rest.stripeRequests.map((request) => [request.method, request.pathname])).toEqual([
                    ["GET", "/v1/balance_settings"],
                ]);

                const claimIndex = harness.rest.postgrestRequests.findIndex(
                    (request) => request.table === "rpc/claim_financial_operations",
                );
                const expectedAfterClaim: Array<[string, string]> = [
                    ["POST", "rpc/claim_financial_operations"],
                    ["POST", "rpc/read_financial_operation_recovery_context"],
                    ["PATCH", "financial_operations"],
                    ...(recoveryCase.kind === "refund"
                        ? [["POST", "rpc/enqueue_commerce_refund_projection"] as [string, string]]
                        : []),
                    ["PATCH", "reconciliation_runs"],
                    ["POST", "rpc/read_reconciliation_operations"],
                    ["POST", "rpc/claim_reconciliation_projection_batch"],
                ];
                expect(
                    harness.rest.postgrestRequests.slice(claimIndex).map((request) => [request.method, request.table]),
                ).toEqual(expectedAfterClaim);
            });
        }
    });
}
