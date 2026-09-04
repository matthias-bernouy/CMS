import type { FinancialOperationRow } from "../../../db/records/operations.ts";

type FinancialOperationRecoveryDependencies = {
    recoverPayoutScheduleOperation(operation: FinancialOperationRow): Promise<boolean>;
    recoverPaymentOperation(operation: FinancialOperationRow): Promise<boolean>;
};

export function createFinancialOperationRecovery({
    recoverPayoutScheduleOperation,
    recoverPaymentOperation,
}: FinancialOperationRecoveryDependencies): (operation: FinancialOperationRow) => Promise<boolean> {
    return async function processClaimedFinancialOperation(operation) {
        if (operation.operation_type === "payout_schedule_update" && !operation.payment_id) {
            return await recoverPayoutScheduleOperation(operation);
        }
        return await recoverPaymentOperation(operation);
    };
}
