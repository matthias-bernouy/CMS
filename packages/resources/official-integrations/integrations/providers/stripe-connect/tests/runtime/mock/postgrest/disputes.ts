import { jsonResponse } from "../../http";
import { same } from "../../records";
import type { JsonRecord } from "../../types";
import type { StripeConnectMock } from "../stripe-connect";

export async function handleDisputeRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/mark_payment_manual_review" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const payment = mock.tables.payments.find((row) => same(row.id, body.p_payment_id));
        if (payment) {
            Object.assign(payment, { settlement_status: "manual_review", manual_review_reason: body.p_reason });
        }
        return jsonResponse(payment ?? {});
    }
    if (table === "rpc/apply_dispute_funds_truth" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const dispute = mock.tables.stripe_disputes.find((row) => row.stripe_dispute_id === body.p_stripe_dispute_id);
        if (!dispute) {
            return jsonResponse({ message: "not_found: Stripe dispute" }, 400);
        }
        const previousAt = Date.parse(String(dispute.last_funds_event_at ?? ""));
        const nextAt = Date.parse(String(body.p_event_at));
        if (!Number.isFinite(previousAt) || nextAt > previousAt) {
            mock.update(dispute, {
                funds_withdrawn: body.p_funds_withdrawn,
                last_funds_event_at: body.p_event_at,
                last_funds_event_id: body.p_event_id,
            });
        } else if (nextAt === previousAt && dispute.funds_withdrawn !== body.p_funds_withdrawn) {
            mock.update(dispute, {
                funds_withdrawn: true,
                last_funds_event_id: "same-second-conflict",
            });
        }
        return jsonResponse(dispute);
    }
    if (table === "rpc/read_stripe_dispute_application_context" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const payment = mock.tables.payments.find((row) => row.stripe_charge_id === body.p_stripe_charge_id);
        const dispute = payment
            ? mock.tables.stripe_disputes.find((row) => row.stripe_dispute_id === body.p_stripe_dispute_id)
            : undefined;
        return jsonResponse({ payment: payment ?? null, dispute: dispute ?? null });
    }
    if (table === "rpc/authorize_irreversible_dispute_action" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        if (body.p_actor_kind !== "admin") {
            return jsonResponse({ message: "forbidden: admin approval actor is required" }, 400);
        }
        const dispute = mock.tables.stripe_disputes.find((row) => same(row.id, body.p_dispute_id));
        const payment = dispute ? mock.tables.payments.find((row) => same(row.id, dispute.payment_id)) : undefined;
        if (!payment) {
            return jsonResponse({ message: "not_found: payment not found" }, 400);
        }
        const thresholdAmount = Number(payment.dual_approval_threshold_amount);
        if (Number(body.p_amount) < thresholdAmount) {
            return jsonResponse({
                approved: true,
                dualApprovalRequired: false,
                approvalStatus: "not_required",
                firstApprovedBy: body.p_actor_id,
            });
        }
        const actionKey = String(body.p_action_key);
        let approval = mock.tables.irreversible_dispute_action_approvals.find((row) => row.action_key === actionKey);
        if (!approval) {
            approval = mock.insertGeneric("irreversible_dispute_action_approvals", {
                action_key: actionKey,
                action_type: body.p_action_type,
                dispute_id: body.p_dispute_id,
                amount: body.p_amount,
                threshold_amount: thresholdAmount,
                payload_sha256: body.p_payload_sha256,
                status: "pending_second_approval",
                first_actor_kind: body.p_actor_kind,
                first_actor_id: body.p_actor_id,
                second_actor_kind: null,
                second_actor_id: null,
            });
        } else if (
            approval.action_type !== body.p_action_type ||
            !same(approval.dispute_id, body.p_dispute_id) ||
            !same(approval.amount, body.p_amount) ||
            !same(approval.threshold_amount, thresholdAmount) ||
            approval.payload_sha256 !== body.p_payload_sha256
        ) {
            return jsonResponse({ message: "conflict: irreversible dispute approval replay mismatch" }, 400);
        } else if (approval.status !== "approved" && approval.first_actor_id !== body.p_actor_id) {
            mock.update(approval, {
                status: "approved",
                second_actor_kind: body.p_actor_kind,
                second_actor_id: body.p_actor_id,
            });
        }
        return jsonResponse({
            ...approval,
            approved: approval.status === "approved",
            dualApprovalRequired: true,
            approvalStatus: approval.status,
            firstApprovedBy: approval.first_actor_id,
            secondApprovedBy: approval.second_actor_id,
        });
    }
    return null;
}
