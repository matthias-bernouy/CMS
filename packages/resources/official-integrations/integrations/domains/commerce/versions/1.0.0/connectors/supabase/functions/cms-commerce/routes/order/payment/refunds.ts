import { cmsUserId } from "../../../core/auth.ts";
import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, integer, readJsonObject, requiredText, text } from "../../../core/records.ts";
import { listRows, one, rpc } from "../../../core/rest.ts";

const refundSelect =
    "id,public_id,order_id,claim_id,business_key,reason,status,requested_amount,merchandise_refund_amount,shipping_refund_amount,protection_fee_refund_amount,allocation_version,seller_recovery_amount,seller_reserve_offset_amount,requires_finance_approval,dual_approval_required,requested_by_kind,requested_by,approved_by,first_approved_by,first_approved_at,second_approved_by,second_approved_at,rejected_by,decision_reason,provider_refund_id,provider_operation_key,provider_snapshot,version,created_at,updated_at";

export async function listRefundRequests(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const params = new URLSearchParams({
        select: refundSelect,
        order: "created_at.desc,id.desc",
        limit: String(limit),
        offset: String(offset),
    });
    for (const [query, column] of [
        ["status", "status"],
        ["orderId", "order_id"],
    ] as const) {
        const value = text(url.searchParams.get(query));
        if (value) {
            params.set(column, `eq.${value}`);
        }
    }
    const { rows, total } = await listRows(`refund_requests?${params.toString()}`);
    return json({ items: camelize(rows), total, limit, offset });
}

export async function getRefundRequest(request: Request): Promise<Response> {
    const id = integer(new URL(request.url).searchParams.get("id"), "id", true)!;
    const row = await one("refund_requests", { id }, refundSelect);
    if (!row) {
        throw new HttpError(404, "refund request not found");
    }
    return json(camelize(row));
}

export async function requestOrderRefund(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const orderId = integer(body.orderId, "orderId", true);
    const reason = requiredText(body.reason, "reason");
    const actorId = cmsUserId(request);
    const hasLegacyAmount = body.amount !== undefined;
    const hasAnyAllocation =
        body.merchandiseRefundAmount !== undefined ||
        body.shippingRefundAmount !== undefined ||
        body.protectionFeeRefundAmount !== undefined;
    if (hasLegacyAmount === hasAnyAllocation) {
        throw new HttpError(400, "exactly one refund amount form is required");
    }
    const result = hasAnyAllocation
        ? await rpc("request_allocated_order_refund", {
              p_order_id: orderId,
              p_reason: reason,
              p_merchandise_refund_amount: integer(body.merchandiseRefundAmount, "merchandiseRefundAmount", true),
              p_shipping_refund_amount: integer(body.shippingRefundAmount, "shippingRefundAmount", true),
              p_protection_fee_refund_amount: integer(
                  body.protectionFeeRefundAmount,
                  "protectionFeeRefundAmount",
                  true,
              ),
              p_actor_kind: "admin",
              p_actor_id: actorId,
          })
        : await rpc("request_order_refund", {
              p_order_id: orderId,
              p_reason: reason,
              p_requested_amount: integer(body.amount, "amount", true),
              p_actor_kind: "admin",
              p_actor_id: actorId,
          });
    return json(camelize(result), 201);
}

export async function reviewOrderRefund(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("review_refund_request", {
        p_refund_request_id: integer(body.refundRequestId, "refundRequestId", true),
        p_decision: requiredText(body.decision, "decision"),
        p_actor_id: cmsUserId(request),
        p_reason: requiredText(body.reason, "reason"),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
    });
    return json(camelize(result));
}
