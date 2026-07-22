import { getRowByField, updateRow } from "../../../db/postgrest.ts";
import { sumConfirmedRecoveryAmount } from "../../../db/repositories/ledger.ts";
import { reserveTransferRecovery } from "../../../db/repositories/transfer-recovery.ts";
import type { ConnectPaymentRow } from "../../../db/records/payments.ts";
import {
    transferRecoverySelect,
    type ReservedTransferRecovery,
    type TransferRecoveryRow,
} from "../../../db/records/transfers.ts";
import { HttpError } from "../../../http/errors.ts";
import { errorMessage } from "../../../shared/data.ts";
import type { JsonRecord } from "../../../shared/types.ts";
import { executeTransferReversalAllocation } from "./allocation.ts";
import { createCompleteTransferRecovery, updateTransferRecoveryProgress } from "./completion.ts";
import type {
    MoveOperationToManualReview,
    RecordSellerRecoveryExposure,
    RequiredPayment,
    TransferRecoveryExposureType,
} from "./types.ts";

type TransferReversalWorkflowDependencies = {
    moveOperationToManualReview: MoveOperationToManualReview;
    recordSellerRecoveryExposure: RecordSellerRecoveryExposure;
    requiredPayment: RequiredPayment;
};

export type ExecuteTransferReversal = (
    payment: ConnectPaymentRow,
    recoveryRequestId: string,
    amount: number,
    reason: string | null,
) => Promise<JsonRecord>;

export function createTransferReversalWorkflow({
    moveOperationToManualReview,
    recordSellerRecoveryExposure,
    requiredPayment,
}: TransferReversalWorkflowDependencies): ExecuteTransferReversal {
    const completeTransferRecovery = createCompleteTransferRecovery({
        recordSellerRecoveryExposure,
        requiredPayment,
    });

    return async function executeTransferReversal(payment, recoveryRequestId, amount, reason) {
        const existingRecovery = await getRowByField<TransferRecoveryRow>(
            "transfer_recovery_requests",
            "recovery_request_id",
            recoveryRequestId,
            transferRecoverySelect,
        );
        if (
            existingRecovery &&
            (existingRecovery.payment_id !== payment.id || existingRecovery.requested_amount !== amount)
        ) {
            throw new HttpError(409, "Transfer recovery request replay mismatch");
        }
        const amountStillRequired = existingRecovery ? amount - existingRecovery.confirmed_amount : amount;
        if (amount <= 0 || amountStillRequired > payment.transferred_amount - payment.reversed_amount) {
            throw new HttpError(409, "reversal exceeds the net transferred amount");
        }
        const exposureType: TransferRecoveryExposureType = recoveryRequestId.startsWith("stripe-dispute:")
            ? "chargeback"
            : "refund_recovery";
        await recordSellerRecoveryExposure(
            payment,
            recoveryRequestId,
            exposureType,
            "at_risk",
            amount,
            "Seller funds are awaiting confirmed Transfer Reversal recovery",
            { recoveryRequestId },
        );
        const reservation = await reserveTransferRecovery(payment.id, recoveryRequestId, amount, exposureType, reason);
        let recovery = reservation.recovery;
        const reversals: JsonRecord[] = [];
        let activeAllocation: ReservedTransferRecovery["allocations"][number] | null = null;
        try {
            for (const allocation of reservation.allocations) {
                activeAllocation = allocation;
                reversals.push(await executeTransferReversalAllocation(allocation));
                activeAllocation = null;
                recovery = await updateTransferRecoveryProgress(recovery);
            }

            return await completeTransferRecovery(
                payment,
                recovery,
                recoveryRequestId,
                exposureType,
                amount,
                reversals,
            );
        } catch (error) {
            if (activeAllocation) {
                await updateRow("transfer_reversals", activeAllocation.reversal.id, {
                    status: "manual_review",
                    provider_snapshot: { error: errorMessage(error) },
                }).catch(() => null);
                await moveOperationToManualReview(
                    payment.id,
                    activeAllocation.operation,
                    error,
                    "transfer_reversal_ambiguous",
                );
            }
            const confirmedAmount = await sumConfirmedRecoveryAmount(recovery.id).catch(
                () => recovery.confirmed_amount,
            );
            await updateRow("transfer_recovery_requests", recovery.id, {
                confirmed_amount: confirmedAmount,
                status: "manual_review",
                last_error: errorMessage(error),
            }).catch(() => null);
            await recordSellerRecoveryExposure(
                payment,
                recoveryRequestId,
                "reversal_failure",
                "debt",
                amount,
                "Stripe could not confirm recovery of transferred seller funds",
                { recoveryRequestId, confirmedAmount, error: errorMessage(error) },
                confirmedAmount,
            ).catch(() => null);
            throw error;
        }
    };
}
