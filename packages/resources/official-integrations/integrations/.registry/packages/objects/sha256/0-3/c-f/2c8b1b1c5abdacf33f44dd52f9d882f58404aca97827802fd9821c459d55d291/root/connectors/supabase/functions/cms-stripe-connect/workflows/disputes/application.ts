import { callRpcObject, upsertRow } from "../../db/postgrest.ts";
import { readStripeDisputeApplicationContext } from "../../db/reconciliation.ts";
import { insertPaymentEvent } from "../../db/repositories/events-exceptions.ts";
import { enqueueCommerceProviderProjection } from "../../db/repositories/financial-operations.ts";
import { sumSucceededRefundSellerRecovery } from "../../db/repositories/ledger.ts";
import { updatePayment } from "../../db/repositories/payments.ts";
import { disputeSelect, type StripeDisputeRow } from "../../db/records/disputes.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { terminalDisputeStatus } from "../../domain/disputes/status.ts";
import type { StripeDispute } from "../../provider/types.ts";
import { arrayAt, isRecord, numberAt, objectAt, stringAt } from "../../shared/data.ts";
import type { ExecuteTransferReversal } from "../payments/transfer-reversal/workflow.ts";
import { disputeFundsTruth } from "./funds.ts";
import { recoverDisputeSellerFunds, type RecordSellerRecoveryExposure } from "./recovery.ts";

type StripeDisputeApplicationDependencies = {
    recordSellerRecoveryExposure: RecordSellerRecoveryExposure;
    executeTransferReversal: ExecuteTransferReversal;
};

export type ApplyStripeDispute = (
    provider: StripeDispute,
    eventId: string,
    eventType?: string,
    eventCreatedAt?: string | null,
) => Promise<void>;

export function createStripeDisputeApplication(dependencies: StripeDisputeApplicationDependencies): ApplyStripeDispute {
    return async function applyStripeDispute(provider, eventId, eventType, eventCreatedAt) {
        const disputeId = provider.id;
        const charge =
            typeof provider.charge === "string" ? provider.charge : stringAt(objectAt(provider, "charge"), "id");
        if (!charge) {
            throw new Error("Stripe dispute has no charge id");
        }
        const context = await readStripeDisputeApplicationContext(charge, disputeId);
        const payment = context.payment as unknown as ConnectPaymentRow | null;
        if (!payment) {
            throw new Error(`Stripe dispute ${disputeId} has no local payment`);
        }
        const status = stringAt(provider, "status") || "needs_response";
        const evidenceDetails = objectAt(provider, "evidence_details");
        const dueBy = numberAt(evidenceDetails, "due_by");
        const existingDispute = context.dispute as unknown as StripeDisputeRow | null;
        const submissionCount = numberAt(evidenceDetails, "submission_count") ?? 0;
        const balanceTransactions = arrayAt(provider, "balance_transactions")
            .map((entry) => (typeof entry === "string" ? entry : isRecord(entry) ? stringAt(entry, "id") : ""))
            .filter(Boolean);
        const fundsTruth = await disputeFundsTruth(provider, eventId, eventType, eventCreatedAt);
        const values = {
            payment_id: payment.id,
            stripe_dispute_id: disputeId,
            stripe_charge_id: charge,
            amount: Number(provider.amount ?? 0),
            currency: stringAt(provider, "currency").toLowerCase(),
            reason: stringAt(provider, "reason") || null,
            status,
            evidence_status: terminalDisputeStatus(status)
                ? "closed"
                : submissionCount > 0
                  ? "submitted"
                  : (existingDispute?.evidence_status ?? "not_started"),
            evidence_due_by: dueBy ? new Date(dueBy * 1000).toISOString() : null,
            is_charge_refundable:
                typeof provider.is_charge_refundable === "boolean" ? provider.is_charge_refundable : null,
            funds_withdrawn: existingDispute?.funds_withdrawn ?? false,
            balance_transaction_ids: balanceTransactions,
            provider_snapshot: provider,
        };
        let dispute = await upsertRow<StripeDisputeRow>("stripe_disputes", "stripe_dispute_id", disputeSelect, values);
        if (fundsTruth) {
            dispute = await callRpcObject<StripeDisputeRow>("apply_dispute_funds_truth", {
                p_stripe_dispute_id: disputeId,
                p_event_at: fundsTruth.eventAt,
                p_event_id: fundsTruth.eventId,
                p_funds_withdrawn: fundsTruth.fundsWithdrawn,
            });
        }
        const fundsWithdrawn = dispute.funds_withdrawn;
        const closesWithoutLoss = ["won", "prevented", "warning_closed"].includes(status) && !fundsWithdrawn;
        const localDisputeStatus = localStatus(status, closesWithoutLoss, fundsWithdrawn);
        const preservesExistingManualReview =
            payment.settlement_status === "manual_review" &&
            payment.manual_review_reason !== `Stripe dispute ${disputeId} after Transfer`;
        const authorizedSellerAmount =
            payment.seller_transfer_amount - (await sumSucceededRefundSellerRecovery(payment.id));
        const netTransferredAmount = payment.transferred_amount - payment.reversed_amount;
        const safeSettlementStatus =
            payment.refunded_amount >= payment.amount_total
                ? "refunded"
                : netTransferredAmount >= authorizedSellerAmount
                  ? "released"
                  : "held";
        await updatePayment(payment.id, {
            dispute_status: localDisputeStatus,
            settlement_status: preservesExistingManualReview
                ? "manual_review"
                : closesWithoutLoss
                  ? safeSettlementStatus
                  : netTransferredAmount > 0
                    ? "manual_review"
                    : "blocked",
            manual_review_reason: preservesExistingManualReview
                ? payment.manual_review_reason
                : !closesWithoutLoss && netTransferredAmount > 0
                  ? `Stripe dispute ${disputeId} after Transfer`
                  : closesWithoutLoss
                    ? null
                    : payment.manual_review_reason,
            last_stripe_event_id: eventId.startsWith("evt_") ? eventId : payment.last_stripe_event_id,
            last_provider_sync_at: new Date().toISOString(),
        });
        await insertPaymentEvent(payment.id, "stripe_dispute_updated", "webhook", eventId, {
            disputeId,
            status,
            amount: values.amount,
        });
        await enqueueCommerceProviderProjection(
            payment.id,
            `dispute:${dispute.id}:${eventId}:${status}:${fundsWithdrawn ? "withdrawn" : "available"}`,
            "dispute",
            String(dispute.id),
        );
        await recoverDisputeSellerFunds(
            dependencies,
            payment,
            dispute,
            provider,
            status,
            fundsWithdrawn,
            closesWithoutLoss,
        );
    };
}

function localStatus(status: string, closesWithoutLoss: boolean, fundsWithdrawn: boolean): string {
    if (!closesWithoutLoss && fundsWithdrawn) {
        return "open";
    }
    if (["won", "lost", "prevented", "warning_closed"].includes(status)) {
        return status;
    }
    return status.includes("under_review") ? "under_review" : "open";
}
