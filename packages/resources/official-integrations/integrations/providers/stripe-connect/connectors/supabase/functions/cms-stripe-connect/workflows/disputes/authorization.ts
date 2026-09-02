import { rest, restError } from "../../db/postgrest.ts";
import type { StripeDisputeRow } from "../../db/records/disputes.ts";
import { HttpError } from "../../http/errors.ts";
import { digest } from "../../shared/crypto.ts";
import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

type IrreversibleDisputeAction = {
    actionKey: string;
    actionType: "dispute_evidence_submit" | "dispute_accept";
    dispute: StripeDisputeRow;
    actorId: string;
    actorKind: "admin";
    payload: JsonRecord;
};

type IrreversibleDisputeApproval = {
    approved: boolean;
    dualApprovalRequired: boolean;
    approvalStatus: string;
    firstApprovedBy: string;
    secondApprovedBy?: string;
};

export async function authorizeIrreversibleDisputeAction(
    options: IrreversibleDisputeAction,
): Promise<IrreversibleDisputeApproval> {
    if (options.actorKind !== "admin") {
        throw new HttpError(403, "admin approval actor is required");
    }
    const response = await rest("rpc/authorize_irreversible_dispute_action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_action_key: options.actionKey,
            p_action_type: options.actionType,
            p_dispute_id: options.dispute.id,
            p_amount: options.dispute.amount,
            p_actor_kind: options.actorKind,
            p_actor_id: options.actorId,
            p_payload_sha256: await digest(JSON.stringify(options.payload)),
        }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const result = await response.json();
    if (
        !isRecord(result) ||
        typeof result.approved !== "boolean" ||
        typeof result.dualApprovalRequired !== "boolean" ||
        typeof result.approvalStatus !== "string" ||
        typeof result.firstApprovedBy !== "string"
    ) {
        throw new HttpError(502, "irreversible dispute approval returned an invalid response");
    }
    return {
        approved: result.approved,
        dualApprovalRequired: result.dualApprovalRequired,
        approvalStatus: result.approvalStatus,
        firstApprovedBy: result.firstApprovedBy,
        secondApprovedBy: typeof result.secondApprovedBy === "string" ? result.secondApprovedBy : undefined,
    };
}
