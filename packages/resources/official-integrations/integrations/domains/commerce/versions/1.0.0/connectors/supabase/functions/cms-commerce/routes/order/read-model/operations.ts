import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, integer, text } from "../../../core/records.ts";
import { listRows, one, restJson } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";

const operationSelect =
    "order_id,order_public_id,order_number,buyer_cms_user_id,seller_id,currency,buyer_total_amount,seller_proceeds_amount,platform_retained_amount,financial_terms_hash,payment_status,fulfillment_status,settlement_status,claim_status,total_refund_requested_amount,recipient_handoff_at,recipient_handoff_first_observed_at,claim_window_started_at,claim_by_at,release_eligible_at,updated_at";

export async function listProtectedPayments(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const params = new URLSearchParams({
        select: operationSelect,
        order: "updated_at.desc,order_id.desc",
        limit: String(limit),
        offset: String(offset),
    });
    for (const [query, column] of [
        ["paymentStatus", "payment_status"],
        ["settlementStatus", "settlement_status"],
        ["fulfillmentStatus", "fulfillment_status"],
        ["claimStatus", "claim_status"],
    ] as const) {
        const value = text(url.searchParams.get(query));
        if (value) {
            params.set(column, `eq.${value}`);
        }
    }
    const query = text(url.searchParams.get("q"));
    if (query) {
        params.set("or", `(order_number.ilike.*${safeSearch(query)}*,buyer_cms_user_id.ilike.*${safeSearch(query)}*)`);
    }
    const { rows, total } = await listRows(`protected_order_operations?${params.toString()}`);
    return json({ items: camelize(rows), total, limit, offset });
}

export async function getProtectedPayment(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const orderId = integer(url.searchParams.get("orderId"), "orderId");
    const publicId = text(url.searchParams.get("publicId"));
    if (orderId === undefined && !publicId) {
        throw new HttpError(400, "orderId or publicId is required");
    }
    const operation =
        orderId !== undefined
            ? await one("protected_order_operations", { order_id: orderId }, operationSelect)
            : await one("protected_order_operations", { order_public_id: publicId! }, operationSelect);
    if (!operation) {
        throw new HttpError(404, "protected payment not found");
    }
    const id = String(operation.order_id);
    const [
        financialTerms,
        paymentAttempts,
        fulfillment,
        settlement,
        claims,
        refundRequests,
        stripeDisputes,
        auditEvents,
    ] = await Promise.all([
        one("order_financial_terms", { order_id: id }),
        rows("order_payment_attempts", id),
        one("order_fulfillments", { order_id: id }),
        one("order_settlements", { order_id: id }),
        rows("marketplace_claims", id),
        rows("refund_requests", id),
        rows("stripe_dispute_projections", id, "opened_at.desc,id.desc"),
        rows("audit_events", id, "created_at.asc,id.asc"),
    ]);
    return json(
        camelize({
            ...operation,
            financialTerms,
            paymentAttempts,
            fulfillment,
            settlement,
            claims,
            refundRequests,
            stripeDisputes,
            auditEvents,
        }),
    );
}

export async function listCommerceExceptions(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const params = new URLSearchParams({
        select: "*",
        order: "detected_at.desc,id.desc",
        limit: String(limit),
        offset: String(offset),
    });
    for (const [query, column] of [
        ["kind", "kind"],
        ["status", "status"],
        ["orderId", "order_id"],
    ] as const) {
        const value = text(url.searchParams.get(query));
        if (value) {
            params.set(column, `eq.${value}`);
        }
    }
    const { rows: items, total } = await listRows(`financial_exceptions?${params.toString()}`);
    return json({ items: camelize(items), total, limit, offset });
}

function rows(table: string, orderId: string, order = "created_at.desc,id.desc"): Promise<JsonRecord[]> {
    return restJson(`${table}?select=*&order_id=eq.${orderId}&order=${order}`);
}

function safeSearch(value: string): string {
    return value.replace(/[%*,()]/g, "").slice(0, 100);
}
