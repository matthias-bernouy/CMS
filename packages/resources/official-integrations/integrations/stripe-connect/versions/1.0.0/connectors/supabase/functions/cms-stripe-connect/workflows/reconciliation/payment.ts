import { listRows } from "../../db/postgrest.ts";
import { readPaymentReconciliationLocalContext, readPaymentReconciliationLedger } from "../../db/reconciliation.ts";
import { updatePayment } from "../../db/repositories/payments.ts";
import { markPaymentManualReview } from "../../db/repositories/payout-controls.ts";
import { paymentSelect, type ConnectPaymentRow } from "../../db/records/payments.ts";
import type { RefundRow } from "../../db/records/refunds.ts";
import { HttpError } from "../../http/errors.ts";
import { retrieveStripeRefundSnapshot } from "../../provider/refunds.ts";
import { errorMessage } from "../../shared/data.ts";
import { syncPayment } from "../payments/projection.ts";
import type { ApplyStripeRefund } from "../refunds/projection.ts";
import type { ReconcileProviderObject } from "./provider-objects.ts";

type PaymentReconciliationDependencies = {
    applyStripeRefund: ApplyStripeRefund;
    reconcileProviderDisputes: ReconcileProviderObject;
    reconcileProviderRefunds: ReconcileProviderObject;
    reconcileProviderTransfers: ReconcileProviderObject;
    requiredPayment(paymentId: number): Promise<ConnectPaymentRow>;
};

export type ReconcilePayment = (payment: ConnectPaymentRow) => Promise<ConnectPaymentRow>;

export type StalePaymentReconciliation = {
    remainingWorkBudget: number;
    scanned: number;
    repaired: number;
    exceptions: number;
    reconciledStalePayments: number;
};

export async function reconcileStalePayments(
    remainingWorkBudget: number,
    reconcilePayment: ReconcilePayment,
): Promise<StalePaymentReconciliation> {
    let repaired = 0;
    let exceptions = 0;
    const stalePaymentBudget = Math.max(1, remainingWorkBudget - 2);
    const stalePayments =
        remainingWorkBudget > 0
            ? await listRows<ConnectPaymentRow>(
                  "payments?payment_status=in.(created,requires_action,processing,succeeded)" +
                      `&select=${encodeURIComponent(paymentSelect)}` +
                      `&order=last_provider_sync_at.asc.nullsfirst,updated_at.asc&limit=${stalePaymentBudget}`,
              )
            : [];
    remainingWorkBudget -= stalePayments.length;
    for (const payment of stalePayments) {
        try {
            const before = `${payment.payment_status}:${payment.stripe_charge_id ?? ""}:${payment.refunded_amount}`;
            const reconciled = await reconcilePayment(payment);
            const after = `${reconciled.payment_status}:${reconciled.stripe_charge_id ?? ""}:${reconciled.refunded_amount}`;
            if (before !== after) {
                repaired++;
            }
        } catch (error) {
            exceptions++;
            await markPaymentManualReview(payment.id, "stale provider payment reconciliation failed", {
                error: errorMessage(error),
            }).catch(() => null);
        }
    }
    return {
        remainingWorkBudget,
        scanned: stalePayments.length,
        repaired,
        exceptions,
        reconciledStalePayments: stalePayments.length,
    };
}

export function createPaymentReconciliationWorkflow({
    applyStripeRefund,
    reconcileProviderDisputes,
    reconcileProviderRefunds,
    reconcileProviderTransfers,
    requiredPayment,
}: PaymentReconciliationDependencies): ReconcilePayment {
    return async function reconcilePayment(payment) {
        let current = await syncPayment(payment);
        if (current.stripe_charge_id) {
            await reconcileProviderDisputes(current);
            await reconcileProviderRefunds(current);
            await reconcileProviderTransfers(current);
        }
        const localContext = await readPaymentReconciliationLocalContext(payment.id);
        if (current.stripe_charge_id) {
            const refreshedPayment = localContext.payment as unknown as ConnectPaymentRow | null;
            if (!refreshedPayment) {
                throw new HttpError(404, "payment not found");
            }
            current = refreshedPayment;
        }
        const refunds = localContext.refunds as unknown as RefundRow[];
        for (const refund of refunds) {
            if (!refund.stripe_refund_id || refund.status === "succeeded") {
                continue;
            }
            const provider = await retrieveStripeRefundSnapshot(refund.stripe_refund_id);
            await applyStripeRefund(refund, provider);
        }
        const ledger = await readPaymentReconciliationLedger(payment.id);
        const refundedAmount = Number(ledger.refunded_amount);
        const transferredAmount = Number(ledger.transferred_amount);
        const reversedAmount = Number(ledger.reversed_amount);
        const sellerRecoveryAmount = Number(ledger.seller_recovery_amount);
        const authorizedSellerAmount = current.seller_transfer_amount - sellerRecoveryAmount;
        const netTransferredAmount = transferredAmount - reversedAmount;
        if (
            refundedAmount > current.amount_total ||
            reversedAmount > transferredAmount ||
            sellerRecoveryAmount > current.seller_transfer_amount ||
            netTransferredAmount > authorizedSellerAmount
        ) {
            await markPaymentManualReview(current.id, "provider ledger arithmetic divergence", {
                refundedAmount,
                transferredAmount,
                reversedAmount,
                sellerRecoveryAmount,
                authorizedSellerAmount,
                netTransferredAmount,
            });
            current = await requiredPayment(current.id);
            throw new HttpError(409, "provider ledger arithmetic divergence requires finance review");
        } else {
            current =
                (await updatePayment(current.id, {
                    refunded_amount: refundedAmount,
                    transferred_amount: transferredAmount,
                    reversed_amount: reversedAmount,
                    last_provider_sync_at: new Date().toISOString(),
                })) ?? current;
        }
        return current;
    };
}
