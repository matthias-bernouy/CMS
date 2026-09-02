import { getRowByField } from "../../db/postgrest.ts";
import { disputeSelect, type StripeDisputeRow } from "../../db/records/disputes.ts";
import { HttpError } from "../../http/errors.ts";

export async function requiredDispute(disputeId: string): Promise<StripeDisputeRow> {
    const row = await getRowByField<StripeDisputeRow>("stripe_disputes", "stripe_dispute_id", disputeId, disputeSelect);
    if (!row) {
        throw new HttpError(404, "Stripe dispute not found");
    }
    return row;
}
