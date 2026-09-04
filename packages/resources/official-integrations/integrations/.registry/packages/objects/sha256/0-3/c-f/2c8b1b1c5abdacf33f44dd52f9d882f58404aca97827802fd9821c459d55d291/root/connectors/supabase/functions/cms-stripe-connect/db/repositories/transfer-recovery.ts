import { HttpError } from "../../http/errors.ts";
import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { firstRow, rest, restError } from "../postgrest.ts";
import type { FinancialOperationRow } from "../records/operations.ts";
import type {
    ReservedTransferRecovery,
    TransferRecoveryRow,
    TransferReversalRow,
    TransferRow,
} from "../records/transfers.ts";

export async function reserveTransferRecovery(
    paymentId: number,
    recoveryRequestId: string,
    amount: number,
    exposureType: TransferRecoveryRow["exposure_type"],
    reason: string | null,
): Promise<ReservedTransferRecovery> {
    const response = await rest("rpc/reserve_transfer_recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_payment_id: paymentId,
            p_recovery_request_id: recoveryRequestId,
            p_amount: amount,
            p_exposure_type: exposureType,
            p_reason: reason,
        }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const value = await response.json();
    const result = isRecord(value) ? value : firstRow<JsonRecord>(value);
    const recovery = result.recovery;
    const allocations = result.allocations;
    if (!isRecord(recovery) || !Array.isArray(allocations)) {
        throw new HttpError(502, "Supabase returned an invalid Transfer recovery reservation");
    }
    return {
        recovery: recovery as TransferRecoveryRow,
        allocations: allocations.map((allocation) => {
            if (
                !isRecord(allocation) ||
                !isRecord(allocation.reversal) ||
                !isRecord(allocation.operation) ||
                !isRecord(allocation.transfer)
            ) {
                throw new HttpError(502, "Supabase returned an invalid Transfer recovery allocation");
            }
            return {
                reversal: allocation.reversal as TransferReversalRow,
                operation: allocation.operation as FinancialOperationRow,
                transfer: allocation.transfer as TransferRow,
            };
        }),
    };
}
