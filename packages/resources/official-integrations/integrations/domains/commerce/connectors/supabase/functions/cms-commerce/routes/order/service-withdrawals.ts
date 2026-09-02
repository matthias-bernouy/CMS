import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { booleanValue, camelize, integer, readJsonObject, requiredText, text } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";

export async function submitMyServiceWithdrawalRequest(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const orderId = integer(body.orderId, "orderId", true)!;
    if (orderId <= 0) {
        throw new HttpError(400, "orderId must be positive");
    }
    const confirmed = booleanValue(body.confirmed, "confirmed");
    if (confirmed !== true) {
        throw new HttpError(400, "confirmed must be true");
    }
    const result = await rpc("submit_marketplace_service_withdrawal_request", {
        p_order_id: orderId,
        p_buyer_cms_user_id: cmsUserId(request),
        p_service_scope: requiredText(body.serviceScope, "serviceScope"),
        p_reason: text(body.reason) ?? null,
        p_confirmed: confirmed,
        p_idempotency_key: requiredText(body.idempotencyKey, "idempotencyKey"),
    });
    return json(camelize(result), 201);
}

export async function listMyServiceWithdrawalRequests(request: Request): Promise<Response> {
    return listServiceWithdrawalRequests(request, cmsUserId(request), false);
}

export async function listAdminServiceWithdrawalRequests(request: Request): Promise<Response> {
    return listServiceWithdrawalRequests(request, null, true);
}

export async function reviewServiceWithdrawalRequest(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("review_marketplace_service_withdrawal_request", {
        p_request_public_id: uuid(requiredText(body.requestPublicId, "requestPublicId"), "requestPublicId"),
        p_next_status: requiredText(body.nextStatus, "nextStatus"),
        p_resolution: text(body.resolution) ?? null,
        p_actor_id: cmsUserId(request),
        p_note: requiredText(body.note, "note"),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
    });
    return json(camelize(result));
}

async function listServiceWithdrawalRequests(
    request: Request,
    accessBuyerCmsUserId: string | null,
    allowBuyerFilter: boolean,
): Promise<Response> {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const orderId = integer(url.searchParams.get("orderId"), "orderId");
    if (orderId !== undefined && orderId <= 0) {
        throw new HttpError(400, "orderId must be positive");
    }
    const requestPublicId = text(url.searchParams.get("requestPublicId"));
    const result = await rpc("list_marketplace_service_withdrawal_requests", {
        p_access_buyer_cms_user_id: accessBuyerCmsUserId,
        p_buyer_cms_user_id: allowBuyerFilter ? (text(url.searchParams.get("buyerCmsUserId")) ?? null) : null,
        p_request_public_id: requestPublicId ? uuid(requestPublicId, "requestPublicId") : null,
        p_order_id: orderId ?? null,
        p_status: text(url.searchParams.get("status")) ?? null,
        p_service_scope: text(url.searchParams.get("serviceScope")) ?? null,
        p_limit: limit,
        p_offset: offset,
    });
    return json(camelize(result));
}

function uuid(value: string, name: string): string {
    if (!uuidPattern.test(value)) {
        throw new HttpError(400, `${name} must be a UUID`);
    }
    return value.toLowerCase();
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
