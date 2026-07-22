import { updateRow } from "../../../db/postgrest.ts";
import { readTransferReversalCompletionContext, sumConfirmedRecoveryAmount } from "../../../db/repositories/ledger.ts";
import { updatePayment } from "../../../db/repositories/payments.ts";
import { markPaymentManualReview } from "../../../db/repositories/payout-controls.ts";
import type { ConnectPaymentRow } from "../../../db/records/payments.ts";
import { transferRecoverySelect, type TransferRecoveryRow } from "../../../db/records/transfers.ts";
import { publicTransferRecovery } from "../../../domain/transfers/presentation.ts";
import { HttpError } from "../../../http/errors.ts";
import type { JsonRecord } from "../../../shared/types.ts";
import type { RecordSellerRecoveryExposure, TransferRecoveryExposureType } from "./types.ts";

type TransferRecoveryCompletionDependencies = {
    recordSellerRecoveryExposure: RecordSellerRecoveryExposure;
};

export async function updateTransferRecoveryProgress(recovery: TransferRecoveryRow): Promise<TransferRecoveryRow> {
    const confirmedAmount = await sumConfirmedRecoveryAmount(recovery.id);
    return (
        (await updateRow<TransferRecoveryRow>(
            "transfer_recovery_requests",
            recovery.id,
            {
                confirmed_amount: confirmedAmount,
                status:
                    confirmedAmount === recovery.requested_amount
                        ? "succeeded"
                        : confirmedAmount > 0
                          ? "partially_succeeded"
                          : "processing",
                last_error: null,
            },
            transferRecoverySelect,
        )) ?? recovery
    );
}

export function createCompleteTransferRecovery({
    recordSellerRecoveryExposure,
}: TransferRecoveryCompletionDependencies) {
    return async function completeTransferRecovery(
        payment: ConnectPaymentRow,
        recovery: TransferRecoveryRow,
        recoveryRequestId: string,
        exposureType: TransferRecoveryExposureType,
        amount: number,
        reversals: JsonRecord[],
    ): Promise<JsonRecord> {
        const confirmedAmount = await sumConfirmedRecoveryAmount(recovery.id);
        if (confirmedAmount !== recovery.requested_amount || recovery.allocation_shortfall_amount > 0) {
            const message =
                recovery.allocation_shortfall_amount > 0
                    ? "confirmed Transfers cannot cover the requested recovery"
                    : "Transfer Reversal recovery is not fully confirmed";
            recovery =
                (await updateRow<TransferRecoveryRow>(
                    "transfer_recovery_requests",
                    recovery.id,
                    {
                        confirmed_amount: confirmedAmount,
                        status: "manual_review",
                        last_error: message,
                    },
                    transferRecoverySelect,
                )) ?? recovery;
            await recordSellerRecoveryExposure(
                payment,
                recoveryRequestId,
                "reversal_failure",
                "debt",
                amount,
                message,
                { recoveryRequestId, confirmedAmount, shortfallAmount: recovery.allocation_shortfall_amount },
                confirmedAmount,
            );
            await markPaymentManualReview(payment.id, message, {
                recoveryRequestId,
                requestedAmount: amount,
                confirmedAmount,
                allocationShortfallAmount: recovery.allocation_shortfall_amount,
            });
            throw new HttpError(409, message);
        }

        recovery =
            (await updateRow<TransferRecoveryRow>(
                "transfer_recovery_requests",
                recovery.id,
                {
                    confirmed_amount: confirmedAmount,
                    status: "succeeded",
                    last_error: null,
                },
                transferRecoverySelect,
            )) ?? recovery;
        const context = await readTransferReversalCompletionContext(payment.id);
        const reversedAmount = context.reversedAmount;
        const currentPayment = context.payment;
        if (!currentPayment) {
            throw new HttpError(404, "payment not found");
        }
        const preservesBlockingSettlement = ["blocked", "manual_review", "refund_pending"].includes(
            currentPayment.settlement_status,
        );
        await updatePayment(payment.id, {
            reversed_amount: reversedAmount,
            settlement_status: preservesBlockingSettlement
                ? currentPayment.settlement_status
                : reversedAmount >= currentPayment.transferred_amount
                  ? "reversed"
                  : "released",
        });
        await recordSellerRecoveryExposure(
            payment,
            recoveryRequestId,
            exposureType,
            "recovered",
            amount,
            "Stripe confirmed seller Transfer Reversal recovery",
            {
                recoveryRequestId,
                stripeTransferReversalIds: reversals.map((reversal) => reversal.stripeTransferReversalId),
            },
        );
        return publicTransferRecovery(recovery, reversals);
    };
}
