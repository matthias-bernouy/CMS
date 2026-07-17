import { cmsUserId } from "../../../core/auth.ts";
import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, integer, text } from "../../../core/records.ts";
import { listRows, one, restJson, rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";
import {
    publicOrderMetadataDefinitions,
    type PublicOrderMetadataDefinition,
    withPublicOrderMetadata,
} from "../../../core/order-metadata.ts";

const saleSelect = "id,public_id,order_number,checkout_group_id,status,currency,subtotal_amount,shipping_amount,delivery_quoted_at,total_amount,metadata,version,created_at,updated_at";
const lineSelect = "id,order_id,offer_id,product_id,variant_id,accepted_proposal_id,title,sku,quantity,unit_amount,total_amount,product_snapshot,variant_snapshot,offer_snapshot,created_at";
const eventSelect = "id,order_id,event_type,previous_status,next_status,created_at";
const saleFields = ["id", "publicId", "orderNumber", "checkoutGroupId", "status", "currency", "subtotalAmount", "shippingAmount", "deliveryQuotedAt", "totalAmount", "metadata", "version", "createdAt", "updatedAt"] as const;
const lineFields = ["id", "orderId", "offerId", "productId", "variantId", "acceptedProposalId", "title", "sku", "quantity", "unitAmount", "totalAmount", "productSnapshot", "variantSnapshot", "offerSnapshot", "createdAt"] as const;
const eventFields = ["id", "orderId", "eventType", "previousStatus", "nextStatus", "createdAt"] as const;
const operationFields = ["orderId", "orderPublicId", "orderNumber", "currency", "paymentStatus", "fulfillmentStatus", "settlementStatus", "claimStatus", "recipientHandoffAt", "recipientHandoffFirstObservedAt", "claimWindowStartedAt", "claimByAt", "releaseEligibleAt", "updatedAt"] as const;
const financialFields = [
    "orderId", "merchandiseSubtotalAmount", "shippingAmount", "sellerCommissionAmount",
    "platformShippingShareAmount", "sellerShippingShareAmount", "sellerProceedsAmount",
    "sellerTransferReleaseAmount", "sellerReserveLiabilityAmount", "currency",
    "pricingLockedAt", "payByAt", "financialRevision",
] as const;
const fulfillmentFields = ["orderId", "status", "sellerHandoffDeadline", "scanGraceDeadline", "sellerHandoffDeclaredAt", "carrierAcceptedAt", "recipientHandoffAt", "recipientHandoffFirstObservedAt", "claimWindowStartedAt", "claimByAt", "releaseEligibleAt", "blockingReason", "version"] as const;
const settlementFields = ["orderId", "status", "authorizedSellerAmount", "totalTransferredAmount", "totalReversedAmount", "sellerReserveLiabilityRemainingAmount", "version"] as const;
const authorizationFields = ["allowed", "reason", "orderId", "orderPublicId", "sellerId", "currency", "paymentStatus", "fulfillmentStatus"] as const;

export async function listMySales(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const seller = await currentSeller(request);
    if (!seller) return json({ items: [], total: 0, limit, offset });
    const params = new URLSearchParams({ select: saleSelect, seller_id: `eq.${String(seller.id)}`, order: "created_at.desc,id.desc", limit: String(limit), offset: String(offset) });
    const status = text(url.searchParams.get("status"));
    if (status) params.set("status", `eq.${status}`);
    const [{ rows, total }, definitions] = await Promise.all([
        listRows(`orders?${params.toString()}`),
        publicOrderMetadataDefinitions(),
    ]);
    return json({ items: rows.map(row => saleRecord(row, definitions)), total, limit, offset });
}

export async function getMySale(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const id = integer(url.searchParams.get("id"), "id");
    const publicId = text(url.searchParams.get("publicId"));
    if (id === undefined && !publicId) throw new HttpError(400, "id or publicId is required");
    const seller = await currentSeller(request);
    if (!seller) throw new HttpError(404, "sale not found");
    const filters = id !== undefined ? { id, seller_id: seller.id } : { public_id: publicId!, seller_id: seller.id };
    const row = await one("orders", filters, saleSelect);
    if (!row) throw new HttpError(404, "sale not found");
    const [lines, events, operation, financialTerms, fulfillment, settlement, authorization, definitions] = await Promise.all([
        restJson<JsonRecord[]>(`order_lines?select=${lineSelect}&order_id=eq.${String(row.id)}&seller_id=eq.${String(seller.id)}&order=id.asc`),
        restJson<JsonRecord[]>(`order_events?select=${eventSelect}&order_id=eq.${String(row.id)}&order=created_at.asc,id.asc`),
        one("protected_order_operations", { order_id: String(row.id) }),
        one(
            "order_financial_terms",
            { order_id: String(row.id) },
            "order_id,merchandise_subtotal_amount,shipping_amount,seller_commission_amount,platform_shipping_share_amount,seller_shipping_share_amount,seller_proceeds_amount,seller_transfer_release_amount,seller_reserve_liability_amount,currency,pricing_locked_at,pay_by_at,financial_revision",
        ),
        one("order_fulfillments", { order_id: String(row.id) }, "order_id,status,seller_handoff_deadline,scan_grace_deadline,seller_handoff_declared_at,carrier_accepted_at,recipient_handoff_at,recipient_handoff_first_observed_at,claim_window_started_at,claim_by_at,release_eligible_at,blocking_reason,version"),
        one("order_settlements", { order_id: String(row.id) }, "order_id,status,authorized_seller_amount,total_transferred_amount,total_reversed_amount,seller_reserve_liability_remaining_amount,version"),
        rpc("get_order_fulfillment_authorization", { p_order_public_id: row.public_id }),
        publicOrderMetadataDefinitions(),
    ]);
    const projection = {
        operation: safeOptional(operation, operationFields),
        financialTerms: safeOptional(financialTerms, financialFields),
        fulfillment: safeOptional(fulfillment, fulfillmentFields),
        settlement: safeOptional(settlement, settlementFields),
        authorization: safeOptional(authorization as JsonRecord, authorizationFields),
    };
    return json({ ...saleRecord(row, definitions), ...projection, lines: lines.map(line => safeRecord(line, lineFields)), events: events.map(event => safeRecord(event, eventFields)) });
}

async function currentSeller(request: Request): Promise<JsonRecord | null> {
    return await one("sellers", { cms_user_id: cmsUserId(request) }, "id");
}

function saleRecord(
    row: JsonRecord,
    definitions: readonly PublicOrderMetadataDefinition[],
): JsonRecord {
    return withPublicOrderMetadata(safeRecord(row, saleFields), definitions);
}

function safeRecord(row: JsonRecord, fields: readonly string[]): JsonRecord {
    const value = camelize(row) as JsonRecord;
    return Object.fromEntries(fields.flatMap(field => Object.prototype.hasOwnProperty.call(value, field) ? [[field, value[field]]] : []));
}

function safeOptional(row: JsonRecord | null, fields: readonly string[]): JsonRecord | null {
    return row ? safeRecord(row, fields) : null;
}
