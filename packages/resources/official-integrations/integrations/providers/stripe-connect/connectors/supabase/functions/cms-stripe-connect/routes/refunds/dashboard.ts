import { readRefundDashboardPage } from "../../db/dashboard-reads.ts";
import { getRowByField } from "../../db/postgrest.ts";
import { refundSelect, type RefundRow } from "../../db/records/refunds.ts";
import { publicRefund } from "../../domain/refunds/presentation.ts";
import { requireDashboardAdmin } from "../../http/auth.ts";
import { HttpError } from "../../http/errors.ts";
import { requiredQueryInteger } from "../../http/query.ts";
import { json } from "../../http/responses.ts";

export async function listProviderRefunds(request: Request): Promise<Response> {
    const actor = requireDashboardAdmin(request);
    const rows = await readRefundDashboardPage(request, actor);
    const refunds = rows.map((row) => ({
        ...publicRefund(row.refund as unknown as RefundRow),
        clientReferenceId: row.client_reference_id,
    }));
    return json({ refunds, total: refunds.length });
}

export async function getProviderRefund(request: Request): Promise<Response> {
    requireDashboardAdmin(request);
    const refundId = requiredQueryInteger(request, "refundId");
    const row = await getRowByField<RefundRow>("refunds", "id", String(refundId), refundSelect);
    if (!row) {
        throw new HttpError(404, "refund not found");
    }
    return json(publicRefund(row));
}
