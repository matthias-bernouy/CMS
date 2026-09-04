import { getRowByField, updateRow } from "../../db/postgrest.ts";
import { insertPaymentEvent } from "../../db/repositories/events-exceptions.ts";
import { reserveFinancialOperation, updateFinancialOperation } from "../../db/repositories/financial-operations.ts";
import { operationSelect, type FinancialOperationRow } from "../../db/records/operations.ts";
import { requireDashboardAdmin } from "../../http/auth.ts";
import { assertAllowedKeys, readJsonObject, requiredString } from "../../http/body/index.ts";
import { HttpError } from "../../http/errors.ts";
import { json } from "../../http/responses.ts";
import { closeStripeDispute } from "../../provider/disputes.ts";
import { stableStripeIdempotencyKey } from "../../shared/crypto.ts";
import { jsonEqual } from "../../shared/data.ts";
import type { IrreversibleDisputeRouteDependencies } from "./submission.ts";

export function createAcceptStripeDispute({
    requiredDispute,
    terminalDisputeStatus,
    authorizeIrreversibleDisputeAction,
    moveOperationToManualReview,
}: IrreversibleDisputeRouteDependencies): (request: Request) => Promise<Response> {
    return async function acceptStripeDispute(request) {
        const { userId, actorKind } = requireDashboardAdmin(request);
        const body = await readJsonObject(request);
        assertAllowedKeys(body, ["disputeId", "acceptanceOperationId", "confirmation"]);
        const dispute = await requiredDispute(requiredString(body, "disputeId", 200));
        if (requiredString(body, "confirmation", 50) !== "ACCEPT STRIPE DISPUTE") {
            throw new HttpError(400, "explicit dispute acceptance confirmation is required");
        }
        const acceptanceOperationId = requiredString(body, "acceptanceOperationId", 200);
        const businessKey = `dispute-accept:${dispute.stripe_dispute_id}:${acceptanceOperationId}`;
        const operationRequest = { disputeId: dispute.stripe_dispute_id };
        const existingOperation = await getRowByField<FinancialOperationRow>(
            "financial_operations",
            "business_key",
            businessKey,
            operationSelect,
        );
        if (existingOperation?.status === "succeeded" && jsonEqual(existingOperation.request, operationRequest)) {
            return json({
                disputeId: dispute.stripe_dispute_id,
                evidenceStatus: "accepted",
                operationId: existingOperation.id,
            });
        }
        if (existingOperation && !jsonEqual(existingOperation.request, operationRequest)) {
            throw new HttpError(409, "dispute acceptance replay mismatch");
        }
        if (terminalDisputeStatus(dispute.status)) {
            throw new HttpError(409, "Stripe dispute is already terminal");
        }
        if (["accepted", "closed"].includes(dispute.evidence_status)) {
            throw new HttpError(409, "Stripe dispute was already accepted irreversibly");
        }
        if (dispute.evidence_due_by && Date.parse(dispute.evidence_due_by) <= Date.now()) {
            throw new HttpError(409, "Stripe dispute deadline has passed; refresh provider state before acceptance");
        }
        const approval = await authorizeIrreversibleDisputeAction({
            actionKey: businessKey,
            actionType: "dispute_accept",
            dispute,
            actorId: userId,
            actorKind,
            payload: operationRequest,
        });
        if (!approval.approved) {
            await insertPaymentEvent(
                dispute.payment_id,
                "stripe_dispute_acceptance_first_approval_recorded",
                actorKind,
                userId,
                {
                    disputeId: dispute.stripe_dispute_id,
                    acceptanceOperationId,
                    approvalStatus: approval.approvalStatus,
                },
            );
            return json(
                {
                    disputeId: dispute.stripe_dispute_id,
                    evidenceStatus: dispute.evidence_status,
                    approvalStatus: approval.approvalStatus,
                    dualApprovalRequired: approval.dualApprovalRequired,
                    firstApprovedBy: approval.firstApprovedBy,
                },
                202,
            );
        }
        const operation = await reserveFinancialOperation(dispute.payment_id, {
            businessKey,
            operationType: "dispute_accept",
            request: operationRequest,
        });
        if (operation.status !== "succeeded") {
            try {
                await updateFinancialOperation(operation.id, {
                    status: "processing",
                    attempt_count: operation.attempt_count + 1,
                });
                const provider = await closeStripeDispute(
                    dispute.stripe_dispute_id,
                    await stableStripeIdempotencyKey("dispute-accept", operation.business_key),
                );
                await updateFinancialOperation(operation.id, {
                    status: "succeeded",
                    stripe_object_id: dispute.stripe_dispute_id,
                    response: provider,
                    completed_at: new Date().toISOString(),
                });
                await updateRow("stripe_disputes", dispute.id, {
                    evidence_status: "accepted",
                    provider_snapshot: provider,
                });
                await insertPaymentEvent(dispute.payment_id, "stripe_dispute_accepted", actorKind, userId, {
                    disputeId: dispute.stripe_dispute_id,
                    operationId: operation.id,
                    approvalStatus: approval.approvalStatus,
                    firstApprovedBy: approval.firstApprovedBy,
                    secondApprovedBy: approval.secondApprovedBy ?? null,
                });
            } catch (error) {
                await moveOperationToManualReview(dispute.payment_id, operation, error, "dispute_acceptance_ambiguous");
                throw error;
            }
        }
        return json({
            disputeId: dispute.stripe_dispute_id,
            evidenceStatus: "accepted",
            operationId: operation.id,
            approvalStatus: approval.approvalStatus,
            dualApprovalRequired: approval.dualApprovalRequired,
        });
    };
}
