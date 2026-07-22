import { getRowByField } from "../../db/postgrest.ts";
import { markPaymentManualReview } from "../../db/repositories/payout-controls.ts";
import type { StripeDisputeRow } from "../../db/records/disputes.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { terminalDisputeStatus } from "../../domain/disputes/status.ts";
import type { StripeDispute } from "../../provider/types.ts";
import { errorMessage } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import type { ExecuteTransferReversal } from "../payments/transfer-reversal/workflow.ts";

export type RecordSellerRecoveryExposure = (
    payment: ConnectPaymentRow,
    recoveryKey: string,
    exposureType: "chargeback" | "refund_recovery" | "reversal_failure",
    status: "at_risk" | "debt" | "recovered",
    amount: number,
    reason: string,
    details: JsonRecord,
    recoveredAmount?: number,
) => Promise<void>;

type DisputeRecoveryDependencies = {
    recordSellerRecoveryExposure: RecordSellerRecoveryExposure;
    executeTransferReversal: ExecuteTransferReversal;
};

export async function recoverDisputeSellerFunds(
    dependencies: DisputeRecoveryDependencies,
    payment: ConnectPaymentRow,
    dispute: StripeDisputeRow,
    provider: StripeDispute,
    status: string,
    fundsWithdrawn: boolean,
    closesWithoutLoss: boolean,
): Promise<void> {
    const { recordSellerRecoveryExposure, executeTransferReversal } = dependencies;
    const disputeId = provider.id;
    const recoveryKey = `stripe-dispute:${dispute.id}`;
    const sellerExposureAmount = Math.min(
        Number(provider.amount ?? 0),
        Math.max(0, payment.transferred_amount - payment.reversed_amount),
    );
    if (status === "lost" && sellerExposureAmount > 0) {
        await recordSellerRecoveryExposure(
            payment,
            recoveryKey,
            "chargeback",
            "debt",
            sellerExposureAmount,
            "Stripe dispute was lost before seller funds were fully recovered",
            { disputeId, status },
        );
    } else if ((!terminalDisputeStatus(status) || fundsWithdrawn) && sellerExposureAmount > 0) {
        await recordSellerRecoveryExposure(
            payment,
            recoveryKey,
            "chargeback",
            "at_risk",
            sellerExposureAmount,
            "Open Stripe dispute exposes transferred seller funds",
            { disputeId, status, fundsWithdrawn },
        );
    } else if (closesWithoutLoss) {
        const existingExposure = await getRowByField<JsonRecord>(
            "seller_recovery_exposures",
            "recovery_key",
            recoveryKey,
            "*",
        );
        const exposureAmount = Number(existingExposure?.amount ?? 0);
        if (exposureAmount > 0) {
            await recordSellerRecoveryExposure(
                payment,
                recoveryKey,
                "chargeback",
                "recovered",
                exposureAmount,
                "Stripe dispute closed without an outstanding seller debt",
                { disputeId, status },
            );
        }
    }

    if ((!terminalDisputeStatus(status) || fundsWithdrawn) && payment.transferred_amount > payment.reversed_amount) {
        const recoveryAmount = Math.min(
            Number(provider.amount ?? 0),
            payment.transferred_amount - payment.reversed_amount,
        );
        if (recoveryAmount > 0) {
            try {
                await executeTransferReversal(
                    payment,
                    `stripe-dispute:${dispute.id}`,
                    recoveryAmount,
                    `Stripe dispute ${disputeId}`,
                );
            } catch (error) {
                await recordSellerRecoveryExposure(
                    payment,
                    recoveryKey,
                    "chargeback",
                    "debt",
                    recoveryAmount,
                    "Stripe dispute Transfer recovery failed",
                    { disputeId, error: errorMessage(error) },
                ).catch(() => null);
                await markPaymentManualReview(payment.id, "Stripe dispute Transfer recovery failed", {
                    disputeId,
                    error: errorMessage(error),
                });
            }
        }
    }
}
