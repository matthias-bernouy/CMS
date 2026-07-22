import { callRpcRows, getRowByField, insertRow, updateRow } from "../../db/postgrest.ts";
import { updateFinancialOperation } from "../../db/repositories/financial-operations.ts";
import type { FinancialOperationRow } from "../../db/records/operations.ts";
import { errorMessage } from "../../shared/data.ts";
import { stripeV1ApiVersion } from "../../shared/runtime.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { reconcilePlatformPayoutProtection } from "../payments/creation/platform-protection.ts";
import { reconcileStalePayments, type ReconcilePayment } from "./payment.ts";
import type { ReconcileAccountPayoutHolds } from "./account-holds.ts";

type ProviderReconciliationRunDependencies = {
    moveOperationToManualReview(
        paymentId: number,
        operation: FinancialOperationRow,
        error: unknown,
        exceptionType: string,
    ): Promise<void>;
    processClaimedFinancialOperation(operation: FinancialOperationRow): Promise<boolean>;
    processStripeEvent(event: JsonRecord): Promise<boolean>;
    reconcileAccountPayoutHolds: ReconcileAccountPayoutHolds;
    reconcilePayment: ReconcilePayment;
};

export type ProviderReconciliationRunResult = { run: JsonRecord };
export type ExecuteProviderReconciliationRun = (
    runKey: string,
    limit: number,
) => Promise<ProviderReconciliationRunResult>;

export function createProviderReconciliationRun({
    moveOperationToManualReview,
    processClaimedFinancialOperation,
    processStripeEvent,
    reconcileAccountPayoutHolds,
    reconcilePayment,
}: ProviderReconciliationRunDependencies): ExecuteProviderReconciliationRun {
    return async function executeProviderReconciliationRun(runKey, limit) {
        let run = await getRowByField<JsonRecord>("reconciliation_runs", "run_key", runKey, "*");
        if (run && ["succeeded", "manual_review"].includes(String(run.status))) {
            return { run };
        }
        if (!run) {
            run = await insertRow<JsonRecord>("reconciliation_runs", "*", { run_key: runKey, status: "running" });
        }

        let scanned = 0;
        let repaired = 0;
        let exceptions = 0;
        let remainingWorkBudget = limit;
        const platform = await reconcilePlatformPayoutProtection();
        exceptions += platform.exceptions;

        // Keep one unit available for every later recovery queue. A permanent
        // webhook backlog must never starve money-operation recovery, provider
        // payment reconciliation, or payout-hold enforcement.
        const eventBudget = Math.max(1, remainingWorkBudget - 4);
        const events =
            remainingWorkBudget > 0
                ? await callRpcRows<JsonRecord>("claim_stripe_events", { p_limit: eventBudget })
                : [];
        remainingWorkBudget -= events.length;
        for (const event of events) {
            scanned++;
            try {
                const changed = await processStripeEvent(event);
                if (changed) {
                    repaired++;
                }
                await updateRow("stripe_events", Number(event.id), {
                    processing_status: changed ? "processed" : "ignored",
                    processing_started_at: null,
                    processed_at: new Date().toISOString(),
                    last_error: null,
                });
            } catch (error) {
                exceptions++;
                await updateRow("stripe_events", Number(event.id), {
                    processing_status: Number(event.attempt_count ?? 0) >= 5 ? "manual_review" : "failed",
                    processing_started_at: null,
                    last_error: errorMessage(error),
                });
            }
        }

        const operationBudget = Math.max(1, remainingWorkBudget - 3);
        const claimedOperations =
            remainingWorkBudget > 0
                ? await callRpcRows<FinancialOperationRow>("claim_financial_operations", {
                      p_limit: operationBudget,
                  })
                : [];
        remainingWorkBudget -= claimedOperations.length;
        for (const operation of claimedOperations) {
            scanned++;
            try {
                if (await processClaimedFinancialOperation(operation)) {
                    repaired++;
                }
            } catch (error) {
                exceptions++;
                if (operation.payment_id) {
                    await moveOperationToManualReview(
                        operation.payment_id,
                        operation,
                        error,
                        "financial_operation_recovery_ambiguous",
                    );
                } else {
                    await updateFinancialOperation(operation.id, {
                        status: "manual_review",
                        last_error: errorMessage(error),
                    }).catch(() => null);
                    await insertRow<JsonRecord>("provider_exceptions", "id", {
                        operation_id: operation.id,
                        exception_type: "account_or_platform_operation_recovery_ambiguous",
                        severity: "critical",
                        message: errorMessage(error),
                        details: { businessKey: operation.business_key, operationType: operation.operation_type },
                    }).catch(() => null);
                }
            }
        }

        const stalePayments = await reconcileStalePayments(remainingWorkBudget, reconcilePayment);
        remainingWorkBudget = stalePayments.remainingWorkBudget;
        scanned += stalePayments.scanned;
        repaired += stalePayments.repaired;
        exceptions += stalePayments.exceptions;
        const accountHolds = await reconcileAccountPayoutHolds(remainingWorkBudget);
        remainingWorkBudget = accountHolds.remainingWorkBudget;
        scanned += accountHolds.scanned;
        repaired += accountHolds.repaired;
        exceptions += accountHolds.exceptions;

        run =
            (await updateRow<JsonRecord>(
                "reconciliation_runs",
                Number(run.id),
                {
                    status: exceptions ? "manual_review" : "succeeded",
                    scanned_count: scanned,
                    repaired_count: repaired,
                    exception_count: exceptions,
                    details: {
                        stripeApiVersion: stripeV1ApiVersion,
                        processedStripeEvents: events.length,
                        recoveredFinancialOperations: claimedOperations.length,
                        reconciledStalePayments: stalePayments.reconciledStalePayments,
                        reconciledSellerRiskAccounts: accountHolds.reconciledSellerRiskAccounts,
                        reconciledManualPayoutHolds: accountHolds.reconciledManualPayoutHolds,
                        platformPayoutInterval: platform.platformPayoutInterval,
                        platformPayoutMinimum: platform.platformPayoutMinimum,
                        platformRequiredMinimum: platform.platformRequiredMinimum,
                        workBudgetLimit: limit,
                        workBudgetConsumed: limit - remainingWorkBudget,
                    },
                    finished_at: new Date().toISOString(),
                },
                "*",
            )) ?? run;
        return { run };
    };
}
