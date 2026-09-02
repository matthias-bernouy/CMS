import { readDisputeDashboardDetail, readDisputeDashboardPage } from "../../db/dashboard-reads.ts";
import { publicDisputeFromDashboardRead } from "../../domain/disputes/presentation.ts";
import { requireDashboardAdmin } from "../../http/auth.ts";
import { HttpError } from "../../http/errors.ts";
import { requiredQueryText } from "../../http/query.ts";
import { json } from "../../http/responses.ts";

export async function listStripeDisputes(request: Request): Promise<Response> {
    const actor = requireDashboardAdmin(request);
    const rows = await readDisputeDashboardPage(request, actor);
    const disputes = rows.map(publicDisputeFromDashboardRead);
    return json({ disputes, total: disputes.length });
}

export async function getStripeDispute(request: Request): Promise<Response> {
    const actor = requireDashboardAdmin(request);
    const disputeId = requiredQueryText(request, "disputeId", 200);
    const row = await readDisputeDashboardDetail(disputeId, actor);
    if (!row) {
        throw new HttpError(404, "Stripe dispute not found");
    }
    return json(publicDisputeFromDashboardRead(row));
}
