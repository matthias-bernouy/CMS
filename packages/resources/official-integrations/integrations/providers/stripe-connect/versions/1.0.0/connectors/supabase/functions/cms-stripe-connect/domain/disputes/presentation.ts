import type { DisputeDashboardRead } from "../../db/dashboard-reads.ts";
import type { StripeDisputeRow } from "../../db/records/disputes.ts";
import type { JsonRecord } from "../../shared/types.ts";

export function publicDispute(row: StripeDisputeRow): JsonRecord {
    return {
        id: row.stripe_dispute_id,
        paymentId: row.payment_id,
        stripeChargeId: row.stripe_charge_id,
        amount: row.amount,
        currency: row.currency,
        reason: row.reason,
        status: row.status,
        evidenceStatus: row.evidence_status,
        evidenceDueBy: row.evidence_due_by,
        isChargeRefundable: row.is_charge_refundable,
        fundsWithdrawn: row.funds_withdrawn,
        balanceTransactionIds: row.balance_transaction_ids,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function publicDisputeFromDashboardRead(read: DisputeDashboardRead): JsonRecord {
    return projectPublicDisputeWithContext(read.dispute as unknown as StripeDisputeRow, {
        clientReferenceId: read.client_reference_id,
        staged: read.staged_evidence,
        evidenceSubmissionCount: read.evidence_submission_count,
        pendingApproval: read.pending_approval,
    });
}

export function projectPublicDisputeWithContext(
    row: StripeDisputeRow,
    context: {
        clientReferenceId: string;
        staged: JsonRecord | null;
        evidenceSubmissionCount: number;
        pendingApproval: JsonRecord | null;
    },
): JsonRecord {
    return {
        ...publicDispute(row),
        providerPaymentId: row.payment_id,
        clientReferenceId: context.clientReferenceId,
        stagedEvidenceOperationId: context.staged?.evidence_operation_id ?? null,
        stagedEvidenceAt: context.staged?.staged_at ?? null,
        evidenceSubmissionCount: context.evidenceSubmissionCount,
        pendingApprovalAction: context.pendingApproval?.action_type ?? null,
        firstApprovedBy: context.pendingApproval?.first_actor_id ?? null,
        firstApprovedAt: context.pendingApproval?.first_approved_at ?? null,
    };
}
