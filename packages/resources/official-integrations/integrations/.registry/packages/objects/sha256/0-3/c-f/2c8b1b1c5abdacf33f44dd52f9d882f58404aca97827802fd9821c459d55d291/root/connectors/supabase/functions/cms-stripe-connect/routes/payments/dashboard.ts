import { rest, restError } from "../../db/postgrest.ts";
import { getPaymentRow } from "../../db/repositories/payments.ts";
import { paymentSelect, type ConnectPaymentRow } from "../../db/records/payments.ts";
import { publicPayment } from "../../domain/payments/presentation.ts";
import { requireDashboardAdmin } from "../../http/auth.ts";
import { HttpError } from "../../http/errors.ts";
import {
    optionalPaymentStatus,
    optionalSettlementStatus,
    queryLimit,
    requiredQueryInteger,
    searchPattern,
} from "../../http/query.ts";
import { json } from "../../http/responses.ts";
import { syncPayment } from "../../workflows/payments/projection.ts";

export async function listProviderPayments(request: Request): Promise<Response> {
    requireDashboardAdmin(request);
    const params = new URL(request.url).searchParams;
    const limit = queryLimit(params.get("limit"));
    const search = searchPattern(params.get("q"));
    const status = optionalPaymentStatus(params.get("paymentStatus"));
    const settlementStatus = optionalSettlementStatus(params.get("settlementStatus"));
    const query = new URLSearchParams({
        select: paymentSelect,
        order: "created_at.desc",
        limit: String(limit),
    });

    if (status) {
        query.set("payment_status", `eq.${status}`);
    }
    if (settlementStatus) {
        query.set("settlement_status", `eq.${settlementStatus}`);
    }
    if (search) {
        const clauses = [
            `client_reference_id.ilike.${search}`,
            `buyer_cms_user_id.ilike.${search}`,
            `seller_cms_user_id.ilike.${search}`,
            `stripe_payment_intent_id.ilike.${search}`,
        ].join(",");
        query.set("or", `(${clauses})`);
    }

    const response = await rest(`payments?${query.toString()}`, { method: "GET" });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as ConnectPaymentRow[];
    return json({
        payments: rows.map(publicPayment),
        total: rows.length,
    });
}

export async function getProviderPayment(request: Request): Promise<Response> {
    requireDashboardAdmin(request);
    const paymentId = requiredQueryInteger(request, "paymentId");
    const row = await getPaymentRow(paymentId);
    if (!row) {
        throw new HttpError(404, "payment not found");
    }
    return json(publicPayment(await syncPayment(row)));
}
