import { getRowByField, updateRow } from "../../db/postgrest.ts";
import { readProviderTransferReconciliationContext } from "../../db/reconciliation.ts";
import { upsertProviderException } from "../../db/repositories/events-exceptions.ts";
import { markPaymentManualReview } from "../../db/repositories/payout-controls.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { refundSelect, type RefundRow } from "../../db/records/refunds.ts";
import type { TransferRow } from "../../db/records/transfers.ts";
import { HttpError } from "../../http/errors.ts";
import { listStripeDisputesByCharge } from "../../provider/disputes.ts";
import { listStripeRefundsByCharge } from "../../provider/refunds.ts";
import { listStripeTransfersByGroup } from "../../provider/transfers.ts";
import type { StripeDispute, StripeRefund } from "../../provider/types.ts";
import { numberAt, recordArrayAt, stringAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import type { ApplyStripeRefund } from "../refunds/projection.ts";

type ApplyStripeDispute = (provider: StripeDispute, eventId: string) => Promise<void>;

type ProviderObjectReconciliationDependencies = {
    applyStripeDispute: ApplyStripeDispute;
    applyStripeRefund: ApplyStripeRefund;
};

export type ReconcileProviderObject = (payment: ConnectPaymentRow) => Promise<void>;

export type ProviderObjectReconciliation = {
    reconcileProviderDisputes: ReconcileProviderObject;
    reconcileProviderRefunds: ReconcileProviderObject;
    reconcileProviderTransfers: ReconcileProviderObject;
};

export function createProviderObjectReconciliation({
    applyStripeDispute,
    applyStripeRefund,
}: ProviderObjectReconciliationDependencies): ProviderObjectReconciliation {
    async function quarantineUntrackedProviderObject(
        payment: ConnectPaymentRow,
        objectType: string,
        objectId: string,
        providerSnapshot: JsonRecord,
    ): Promise<void> {
        const reason = `untracked Stripe ${objectType} ${objectId}`;
        await markPaymentManualReview(payment.id, reason, { objectType, objectId, providerSnapshot });
        await upsertProviderException(`untracked:${objectType}:${objectId}`, {
            payment_id: payment.id,
            exception_type: `untracked_provider_${objectType}`,
            severity: "critical",
            status: "open",
            message: reason,
            details: { providerSnapshot },
        });
    }

    async function reconcileProviderDisputes(payment: ConnectPaymentRow): Promise<void> {
        if (!payment.stripe_charge_id) {
            return;
        }
        const listed = await listStripeDisputesByCharge(payment.stripe_charge_id);
        if (listed.has_more === true) {
            throw new HttpError(409, "Stripe dispute search is incomplete");
        }
        for (const value of recordArrayAt(listed, "data")) {
            const disputeId = stringAt(value, "id");
            if (!disputeId) {
                throw new Error("Stripe dispute search returned an object without id");
            }
            await applyStripeDispute(
                value as StripeDispute,
                `provider-reconciliation:dispute:${disputeId}:${stringAt(value, "status") || "unknown"}`,
            );
        }
    }

    async function reconcileProviderRefunds(payment: ConnectPaymentRow): Promise<void> {
        if (!payment.stripe_charge_id) {
            return;
        }
        const listed = await listStripeRefundsByCharge(payment.stripe_charge_id);
        if (listed.has_more === true) {
            throw new HttpError(409, "Stripe refund search is incomplete");
        }
        for (const value of recordArrayAt(listed, "data")) {
            const refundId = stringAt(value, "id");
            if (!refundId) {
                throw new Error("Stripe refund search returned an object without id");
            }
            const local = await getRowByField<RefundRow>("refunds", "stripe_refund_id", refundId, refundSelect);
            if (local) {
                await applyStripeRefund(local, value as StripeRefund);
                continue;
            }
            await quarantineUntrackedProviderObject(payment, "refund", refundId, value);
        }
    }

    async function reconcileProviderTransfers(payment: ConnectPaymentRow): Promise<void> {
        const listed = await listStripeTransfersByGroup(payment.transfer_group);
        if (listed.has_more === true) {
            throw new HttpError(409, "Stripe Transfer search is incomplete");
        }
        for (const value of recordArrayAt(listed, "data")) {
            const transferId = stringAt(value, "id");
            if (!transferId) {
                throw new Error("Stripe Transfer search returned an object without id");
            }
            const context = await readProviderTransferReconciliationContext(transferId);
            const local = context.transfer as unknown as TransferRow | null;
            if (!local) {
                await quarantineUntrackedProviderObject(payment, "transfer", transferId, value);
                continue;
            }
            const providerReversedAmount = numberAt(value, "amount_reversed") ?? 0;
            const localReversedAmount = Number(context.local_reversed_amount);
            if (providerReversedAmount !== localReversedAmount) {
                await quarantineUntrackedProviderObject(payment, "transfer_reversal", transferId, {
                    ...value,
                    providerReversedAmount,
                    localReversedAmount,
                });
            }
            await updateRow("transfers", local.id, {
                status:
                    value.reversed === true
                        ? "reversed"
                        : providerReversedAmount > 0
                          ? "partially_reversed"
                          : "succeeded",
                provider_snapshot: value,
            });
        }
    }

    return { reconcileProviderDisputes, reconcileProviderRefunds, reconcileProviderTransfers };
}
