import { cmsUserId } from "../core/auth.ts";
import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { camelize, integer, isRecord, readJsonObject, requiredText, text } from "../core/records.ts";
import { one, restJson, rpc } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { publicOrderMetadataDefinitions, withPublicOrderResult } from "../core/order-metadata.ts";

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
