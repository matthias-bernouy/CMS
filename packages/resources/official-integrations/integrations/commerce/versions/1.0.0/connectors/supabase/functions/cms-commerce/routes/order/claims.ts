import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { camelize, integer, readJsonObject, requiredText, text } from "../../core/records.ts";
import { listRows, one, rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { publicClaimEvidence } from "./claim-evidence.ts";

export { getClaim } from "./read-model/claims.ts";

const claimSelect = "id,public_id,order_id,buyer_cms_user_id,seller_id,reason,status,description,buyer_requested_amount,resolution_outcome,resolution_buyer_refund_amount,resolution_seller_transfer_amount,resolution_protection_fee_refund_amount,decision_reason,seller_response_by_at,return_ship_by_at,return_delivery_status,return_provider_reference,return_carrier_accepted_at,return_recipient_handoff_at,resolved_at,resolved_by,version,created_at,updated_at";

export async function openMyOrderClaim(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("open_marketplace_claim", {
        p_order_id: integer(body.orderId, "orderId", true),
        p_buyer_cms_user_id: cmsUserId(request),
        p_reason: requiredText(body.reason, "reason"),
        p_description: requiredText(body.description, "description"),
        p_requested_amount: integer(body.requestedAmount, "requestedAmount") ?? null,
    });
    return json(camelize(result), 201);
}

export async function respondToMySaleClaim(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("respond_marketplace_claim", {
        p_claim_id: integer(body.claimId, "claimId", true),
        p_seller_cms_user_id: cmsUserId(request),
        p_message: requiredText(body.message, "message"),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
    });
    return json(camelize(result));
}

export async function listClaims(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const params = new URLSearchParams({ select: claimSelect, order: "created_at.desc,id.desc", limit: String(limit), offset: String(offset) });
    for (const [query, column] of [["status", "status"], ["reason", "reason"], ["orderId", "order_id"]] as const) {
        const value = text(url.searchParams.get(query));
        if (value) params.set(column, `eq.${value}`);
    }
    const { rows, total } = await listRows(`marketplace_claims?${params.toString()}`);
    return json({ items: camelize(rows), total, limit, offset });
}

export async function listClaimEvidence(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const claimId = integer(url.searchParams.get("claimId"), "claimId", true)!;
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const params = new URLSearchParams({
        select: "id,claim_id,submitted_by_kind,mime_type,file_size,original_filename,sha256,description,metadata,created_at",
        claim_id: `eq.${claimId}`,
        order: "created_at.desc,id.desc",
        limit: String(limit),
        offset: String(offset),
    });
    const listed = await listRows(`marketplace_claim_evidence?${params.toString()}`);
    return json({ items: listed.rows.map(publicClaimEvidence), total: listed.total, limit, offset });
}

export async function getClaimEvidenceMetadata(request: Request): Promise<Response> {
    const id = integer(new URL(request.url).searchParams.get("id"), "id", true)!;
    const evidence = await one(
        "marketplace_claim_evidence",
        { id },
        "id,claim_id,submitted_by_kind,mime_type,file_size,original_filename,sha256,description,metadata,created_at",
    );
    if (!evidence) throw new HttpError(404, "claim evidence not found");
    return json(publicClaimEvidence(evidence));
}

export async function getClaimReturnAuthorization(request: Request): Promise<Response> {
    const claimId = integer(new URL(request.url).searchParams.get("claimId"), "claimId", true)!;
    const claim = await one(
        "marketplace_claims",
        { id: claimId },
        "id,public_id,order_id,buyer_cms_user_id,seller_id,status,resolution_outcome,return_ship_by_at,return_delivery_status,return_recipient_handoff_at,version",
    );
    if (!claim) throw new HttpError(404, "claim not found");
    const [order, seller, financialTerms] = await Promise.all([
        one("orders", { id: String(claim.order_id) }, "id,public_id,order_number,status,shipping_address"),
        one("sellers", { id: String(claim.seller_id) }, "id,cms_user_id"),
        one("order_financial_terms", { order_id: String(claim.order_id) }, "delivery_quote_id,merchandise_subtotal_amount,currency"),
    ]);
    if (!order || !seller || !text(seller.cms_user_id)) {
        throw new HttpError(409, "claim return participants are incomplete");
    }
    const deadline = Date.parse(text(claim.return_ship_by_at) ?? "");
    const deadlinePassed = Number.isFinite(deadline) && deadline <= Date.now();
    const awaitingReturn = claim.status === "return_required"
        && claim.resolution_outcome === "return_required"
        && !claim.return_recipient_handoff_at;
    return json(camelize({
        allowed: awaitingReturn && !deadlinePassed,
        reason: !awaitingReturn ? "claim_not_awaiting_return" : deadlinePassed ? "return_ship_deadline_passed" : "authorized",
        claimId: claim.id,
        claimPublicId: claim.public_id,
        claimStatus: claim.status,
        claimVersion: claim.version,
        returnShipByAt: claim.return_ship_by_at,
        returnDeliveryStatus: claim.return_delivery_status,
        orderId: order.id,
        orderPublicId: order.public_id,
        orderNumber: order.order_number,
        buyerCmsUserId: claim.buyer_cms_user_id,
        sellerId: seller.id,
        sellerCmsUserId: seller.cms_user_id,
        deliveryQuoteId: financialTerms?.delivery_quote_id,
        merchandiseSubtotalMinorAmount: financialTerms?.merchandise_subtotal_amount,
        currency: financialTerms?.currency,
    }));
}

export async function recordClaimReturnDelivery(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const providerEvidence = body.providerEvidence;
    if (providerEvidence !== undefined && (typeof providerEvidence !== "object" || providerEvidence === null || Array.isArray(providerEvidence))) {
        throw new HttpError(400, "providerEvidence must be an object");
    }
    const result = await rpc("record_claim_return_delivery", {
        p_claim_id: integer(body.claimId, "claimId", true),
        p_provider_event_id: requiredText(body.providerEventId, "providerEventId"),
        p_provider_reference: requiredText(body.providerReference, "providerReference"),
        p_normalized_status: requiredText(body.normalizedStatus, "normalizedStatus"),
        p_occurred_at: requiredText(body.occurredAt, "occurredAt"),
        p_provider_evidence: (providerEvidence ?? {}) as JsonRecord,
    });
    return json(camelize(result));
}

export async function resolveOrderClaim(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("resolve_marketplace_claim", {
        p_claim_id: integer(body.claimId, "claimId", true),
        p_outcome: requiredText(body.outcome, "outcome"),
        p_buyer_refund_amount: integer(body.buyerRefundAmount, "buyerRefundAmount", true),
        p_seller_transfer_amount: integer(body.sellerTransferAmount, "sellerTransferAmount", true),
        p_protection_fee_refund_amount: integer(body.protectionFeeRefundAmount, "protectionFeeRefundAmount", true),
        p_decision_reason: requiredText(body.decisionReason, "decisionReason"),
        p_actor_kind: "admin",
        p_actor_id: cmsUserId(request),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
    });
    return json(camelize(result));
}
