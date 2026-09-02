import { insertRow } from "../../db/postgrest.ts";
import { updateFinancialOperation } from "../../db/repositories/financial-operations.ts";
import { markPaymentManualReview } from "../../db/repositories/payout-controls.ts";
import type { FinancialOperationRow } from "../../db/records/operations.ts";
import { errorMessage } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export async function moveOperationToManualReview(
    paymentId: number,
    operation: FinancialOperationRow,
    error: unknown,
    exceptionType: string,
): Promise<void> {
    const message = errorMessage(error);
    await updateFinancialOperation(operation.id, { status: "manual_review", last_error: message }).catch(() => null);
    await markPaymentManualReview(paymentId, message, { operationId: operation.id, exceptionType }).catch(() => null);
    await insertRow<JsonRecord>("provider_exceptions", "*", {
        payment_id: paymentId,
        operation_id: operation.id,
        exception_type: exceptionType,
        severity: "critical",
        message,
        details: { businessKey: operation.business_key, operationType: operation.operation_type },
    }).catch(() => null);
}
