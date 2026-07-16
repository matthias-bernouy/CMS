import { cmsUserId } from "../core/auth.ts";
import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { camelize, integer, isRecord, readJsonObject, requiredText, text } from "../core/records.ts";
import { listRows, one, restJson, rpc } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { publicOrderMetadataDefinitions, withPublicOrderMetadata, withPublicOrderResult } from "../core/order-metadata.ts";
const orderSelect = "id,public_id,order_number,checkout_group_id,seller_id,buyer_cms_user_id,status,currency,subtotal_amount,shipping_amount,delivery_quoted_at,total_amount,shipping_address,billing_address,metadata,idempotency_key,archived_at,version,created_at,updated_at";
const orderLineSelect = "id,order_id,offer_id,product_id,variant_id,accepted_proposal_id,title,sku,quantity,unit_amount,total_amount,product_snapshot,variant_snapshot,offer_snapshot,seller_snapshot,created_at";
const orderOperationListSelect = "order_id,payment_status,fulfillment_status,settlement_status,claim_status,total_refund_requested_amount,updated_at";

export async function listOrders(request: Request, mine: boolean): Promise<Response> {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const params = new URLSearchParams({
        select: orderSelect,
        order: "created_at.desc,id.desc",
        limit: String(limit),
        offset: String(offset),
    });
    if (mine) params.set("buyer_cms_user_id", `eq.${cmsUserId(request)}`);
    const status = text(url.searchParams.get("status"));
    const sellerId = integer(url.searchParams.get("sellerId"), "sellerId");
    if (status) params.set("status", `eq.${status}`);
    if (!mine && sellerId !== undefined) params.set("seller_id", `eq.${sellerId}`);
    const { rows, total } = await listRows(`orders?${params.toString()}`);
    const orderIds = rows.map(row => integer(row.id, "order id"))
        .filter((id): id is number => id !== undefined);
    const [operations, definitions] = await Promise.all([
        orderIds.length
            ? restJson<JsonRecord[]>(`protected_order_operations?select=${orderOperationListSelect}&order_id=in.(${orderIds.join(",")})`)
            : Promise.resolve([]),
        mine ? publicOrderMetadataDefinitions() : Promise.resolve([]),
    ]);
    const operationByOrder = new Map(operations.map(operation => [String(operation.order_id), operation]));
    const items = rows.map(row => {
        const item = {
            ...row,
            operation: operationByOrder.get(String(row.id)) ?? null,
        };
        return mine ? withPublicOrderMetadata(item, definitions) : item;
    });
    return json({ items: camelize(items), total, limit, offset });
}
export async function getOrder(request: Request, mine: boolean): Promise<Response> {
    const url = new URL(request.url);
    const id = integer(url.searchParams.get("id"), "id");
    const publicId = text(url.searchParams.get("publicId"));
    if (id === undefined && !publicId) throw new HttpError(400, "id or publicId is required");
    const row = id !== undefined
        ? await one("orders", { id }, orderSelect)
        : await one("orders", { public_id: publicId! }, orderSelect);
    if (!row || (mine && row.buyer_cms_user_id !== cmsUserId(request))) {
        throw new HttpError(404, "order not found");
    }
    const eventSelect = mine
        ? "id,order_id,event_type,previous_status,next_status,created_at"
        : "*";
    const [lines, events, seller, operation, financialTerms, fulfillment, settlement, claim, definitions] = await Promise.all([
        restJson<JsonRecord[]>(`order_lines?select=${orderLineSelect}&order_id=eq.${String(row.id)}&order=id.asc`),
        restJson<JsonRecord[]>(`order_events?select=${eventSelect}&order_id=eq.${String(row.id)}&order=created_at.asc,id.asc`),
        one("sellers", { id: String(row.seller_id) }, "id,kind,slug,display_name"),
        one("protected_order_operations", { order_id: String(row.id) }),
        one("order_financial_terms", { order_id: String(row.id) }, "order_id,delivery_quote_id,merchandise_subtotal_amount,shipping_amount,buyer_protection_fee_amount,seller_commission_amount,buyer_total_amount,seller_proceeds_amount,platform_retained_amount,currency,financial_terms_hash,pricing_locked_at,pay_by_at,financial_revision"),
        one("order_fulfillments", { order_id: String(row.id) }, "order_id,status,seller_handoff_deadline,scan_grace_deadline,carrier_accepted_at,arrived_at_pickup_point_at,available_for_pickup_at,recipient_handoff_at,recipient_handoff_first_observed_at,claim_window_started_at,claim_by_at,release_eligible_at,blocking_reason,version"),
        one("order_settlements", { order_id: String(row.id) }, "order_id,status,authorized_seller_amount,total_transferred_amount,total_reversed_amount,total_refunded_amount,seller_reserve_liability_remaining_amount,version"),
        restJson<JsonRecord[]>(`marketplace_claims?select=id,public_id,reason,status,seller_response_by_at,return_ship_by_at,resolved_at,version,created_at&order_id=eq.${String(row.id)}&order=created_at.desc&limit=1`).then(rows => rows[0] ?? null),
        mine ? publicOrderMetadataDefinitions() : Promise.resolve([]),
    ]);
    const visibleOrder = mine ? withPublicOrderMetadata(row, definitions) : row;
    return json(camelize({ ...visibleOrder, lines, events, seller, operation, financialTerms, fulfillment, settlement, claim }));
}

export async function createOrder(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    for (const key of ["shippingAddress", "billingAddress", "metadata"] as const) {
        if (body[key] !== undefined && !isRecord(body[key])) throw new HttpError(400, `${key} must be an object`);
    }
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items || items.some(item => !isRecord(item))) throw new HttpError(400, "items must be an array of objects");
    const trustedItems = items.map((item, index) => {
        const row = item as JsonRecord;
        return {
            offerId: integer(row.offerId, `items.${index}.offerId`, true),
            quantity: integer(row.quantity, `items.${index}.quantity`, true),
        };
    });
    const buyerCmsUserId = cmsUserId(request);
    const idempotencyKey = requiredText(body.idempotencyKey, "idempotencyKey");
    const definitions = await publicOrderMetadataDefinitions();
    const result = await rpc("create_order_from_offers", {
        p_buyer_cms_user_id: buyerCmsUserId,
        p_idempotency_key: idempotencyKey,
        p_items: trustedItems,
        p_shipping_address: isRecord(body.shippingAddress) ? body.shippingAddress : {},
        p_billing_address: isRecord(body.billingAddress) ? body.billingAddress : {},
        p_metadata: isRecord(body.metadata) ? body.metadata : {},
    });
    const response = withPublicOrderResult(withoutRequestHash(camelize(result)), definitions);
    const replay = isRecord(response) && response.idempotentReplay === true;
    return json(response, replay ? 200 : 201);
}
export async function getProtectedCheckoutSellerContext(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items?.length || items.some(item => !isRecord(item))) {
        throw new HttpError(400, "items must be a non-empty array of objects");
    }
    const offerIds = [...new Set(items.map((item, index) => {
        const offerId = integer((item as JsonRecord).offerId, `items.${index}.offerId`, true)!;
        if (offerId < 1) throw new HttpError(400, `items.${index}.offerId must be positive`);
        return offerId;
    }))];
    const params = new URLSearchParams({
        select: "id,seller_id",
        id: `in.(${offerIds.join(",")})`,
    });
    const offers = await restJson<JsonRecord[]>(`offers?${params.toString()}`);
    if (offers.length !== offerIds.length) throw new HttpError(404, "offer not found");
    const sellerIds = [...new Set(offers.map(offer => integer(offer.seller_id, "seller id", true)!))];
    if (sellerIds.length !== 1) throw new HttpError(409, "one protected order cannot contain multiple sellers");
    return json(await protectedSellerContext(sellerIds[0]!, cmsUserId(request)));
}

export async function getProtectedPaymentSellerContext(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const orderId = integer(body.orderId, "orderId", true)!;
    if (orderId < 1) throw new HttpError(400, "orderId must be positive");
    const buyerCmsUserId = cmsUserId(request);
    const order = await one("orders", { id: orderId }, "id,seller_id,buyer_cms_user_id");
    if (!order || order.buyer_cms_user_id !== buyerCmsUserId) throw new HttpError(404, "order not found");
    return json(await protectedSellerContext(integer(order.seller_id, "seller id", true)!, buyerCmsUserId));
}

async function protectedSellerContext(sellerId: number, buyerCmsUserId: string): Promise<JsonRecord> {
    const seller = await one("sellers", { id: sellerId }, "id,kind,cms_user_id");
    const sellerCmsUserId = text(seller?.cms_user_id);
    if (!seller || seller.kind !== "user" || !sellerCmsUserId) {
        throw new HttpError(409, "protected marketplace seller identity is unavailable");
    }
    return { sellerCmsUserId, buyerCmsUserId };
}
function withoutRequestHash(value: unknown): unknown {
    if (!isRecord(value)) return value;
    const response = { ...value };
    delete response.requestHash;
    return response;
}
