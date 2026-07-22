import { getRowByField, updateRow } from "../../db/postgrest.ts";
import { insertPaymentEvent } from "../../db/repositories/events-exceptions.ts";
import { reserveFinancialOperation, updateFinancialOperation } from "../../db/repositories/financial-operations.ts";
import type { StripeDisputeRow } from "../../db/records/disputes.ts";
import { operationSelect, type FinancialOperationRow } from "../../db/records/operations.ts";
import { requireDashboardAdmin } from "../../http/auth.ts";
import { assertAllowedKeys, readJsonObject, requiredString } from "../../http/body.ts";
import { HttpError } from "../../http/errors.ts";
import { json } from "../../http/responses.ts";
import { updateStripeDisputeEvidence } from "../../provider/disputes.ts";
import { stableStripeIdempotencyKey } from "../../shared/crypto.ts";
import { jsonEqual } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export type IrreversibleDisputeRouteDependencies = {
    requiredDispute(disputeId: string): Promise<StripeDisputeRow>;
    terminalDisputeStatus(status: string): boolean;
    authorizeIrreversibleDisputeAction(options: {
        actionKey: string;
        actionType: "dispute_evidence_submit" | "dispute_accept";
        dispute: StripeDisputeRow;
        actorId: string;
        actorKind: "admin";
        payload: JsonRecord;
    }): Promise<{
        approved: boolean;
        dualApprovalRequired: boolean;
        approvalStatus: string;
        firstApprovedBy: string;
        secondApprovedBy?: string;
    }>;
    moveOperationToManualReview(
        paymentId: number,
        operation: FinancialOperationRow,
        error: unknown,
        exceptionType: string,
    ): Promise<void>;
};

export function createSubmitStripeDisputeEvidence({
    requiredDispute,
    terminalDisputeStatus,
    authorizeIrreversibleDisputeAction,
    moveOperationToManualReview,
}: IrreversibleDisputeRouteDependencies): (request: Request) => Promise<Response> {
    return async function submitStripeDisputeEvidence(request) {
        const { userId, actorKind } = requireDashboardAdmin(request);
        const body = await readJsonObject(request);
        assertAllowedKeys(body, ["disputeId", "submissionOperationId", "evidenceOperationId", "confirmation"]);
        const dispute = await requiredDispute(requiredString(body, "disputeId", 200));
        if (requiredString(body, "confirmation", 50) !== "SUBMIT STRIPE EVIDENCE") {
            throw new HttpError(400, "explicit evidence submission confirmation is required");
        }
        const evidenceOperationId = requiredString(body, "evidenceOperationId", 200);
        const staged = await getRowByField<JsonRecord>(
            "stripe_dispute_evidence",
            "evidence_operation_id",
            evidenceOperationId,
            "*",
        );
        if (!staged || Number(staged.dispute_id) !== dispute.id) {
            throw new HttpError(404, "staged dispute evidence not found");
        }
        const submissionOperationId = requiredString(body, "submissionOperationId", 200);
        const businessKey = `dispute-evidence:${dispute.stripe_dispute_id}:${submissionOperationId}`;
        const operationRequest = { disputeId: dispute.stripe_dispute_id, evidenceOperationId };
        const existingOperation = await getRowByField<FinancialOperationRow>(
            "financial_operations",
            "business_key",
            businessKey,
            operationSelect,
        );
        if (existingOperation?.status === "succeeded" && jsonEqual(existingOperation.request, operationRequest)) {
            return json({
                disputeId: dispute.stripe_dispute_id,
                evidenceStatus: "submitted",
                operationId: existingOperation.id,
            });
        }
        if (existingOperation && !jsonEqual(existingOperation.request, operationRequest)) {
            throw new HttpError(409, "dispute evidence submission replay mismatch");
        }
        if (terminalDisputeStatus(dispute.status)) {
            throw new HttpError(409, "Stripe dispute is already terminal");
        }
        if (dispute.evidence_due_by && Date.parse(dispute.evidence_due_by) <= Date.now()) {
            throw new HttpError(409, "Stripe evidence deadline has passed");
        }
        if (["submitted", "accepted", "closed"].includes(dispute.evidence_status) || staged.submitted_at) {
            throw new HttpError(409, "Stripe dispute evidence was already submitted irreversibly");
        }
        const approval = await authorizeIrreversibleDisputeAction({
            actionKey: businessKey,
            actionType: "dispute_evidence_submit",
            dispute,
            actorId: userId,
            actorKind,
            payload: operationRequest,
        });
        if (!approval.approved) {
            await insertPaymentEvent(
                dispute.payment_id,
                "stripe_dispute_evidence_first_approval_recorded",
                actorKind,
                userId,
                {
                    disputeId: dispute.stripe_dispute_id,
                    submissionOperationId,
                    approvalStatus: approval.approvalStatus,
                },
            );
            return json(
                {
                    disputeId: dispute.stripe_dispute_id,
                    evidenceStatus: "staged",
                    approvalStatus: approval.approvalStatus,
                    dualApprovalRequired: approval.dualApprovalRequired,
                    firstApprovedBy: approval.firstApprovedBy,
                },
                202,
            );
        }
        const operation = await reserveFinancialOperation(dispute.payment_id, {
            businessKey,
            operationType: "dispute_evidence_submit",
            request: operationRequest,
        });
        if (operation.status !== "succeeded") {
            try {
                await updateFinancialOperation(operation.id, {
                    status: "processing",
                    attempt_count: operation.attempt_count + 1,
                });
                const provider = await updateStripeDisputeEvidence(
                    dispute.stripe_dispute_id,
                    staged.evidence as JsonRecord,
                    await stableStripeIdempotencyKey("dispute-evidence", operation.business_key),
                );
                await updateFinancialOperation(operation.id, {
                    status: "succeeded",
                    stripe_object_id: dispute.stripe_dispute_id,
                    response: provider,
                    completed_at: new Date().toISOString(),
                });
                await updateRow("stripe_dispute_evidence", Number(staged.id), {
                    submitted_operation_id: operation.id,
                    submitted_at: new Date().toISOString(),
                });
                await updateRow("stripe_disputes", dispute.id, {
                    evidence_status: "submitted",
                    provider_snapshot: provider,
                });
                await insertPaymentEvent(dispute.payment_id, "stripe_dispute_evidence_submitted", actorKind, userId, {
                    disputeId: dispute.stripe_dispute_id,
                    operationId: operation.id,
                    approvalStatus: approval.approvalStatus,
                    firstApprovedBy: approval.firstApprovedBy,
                    secondApprovedBy: approval.secondApprovedBy ?? null,
                });
            } catch (error) {
                await moveOperationToManualReview(
                    dispute.payment_id,
                    operation,
                    error,
                    "dispute_evidence_submission_ambiguous",
                );
                throw error;
            }
        }
        return json({
            disputeId: dispute.stripe_dispute_id,
            evidenceStatus: "submitted",
            operationId: operation.id,
            approvalStatus: approval.approvalStatus,
            dualApprovalRequired: approval.dualApprovalRequired,
        });
    };
}
