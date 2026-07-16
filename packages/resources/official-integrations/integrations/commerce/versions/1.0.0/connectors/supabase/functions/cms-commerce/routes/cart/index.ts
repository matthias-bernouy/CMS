import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import {
    camelize,
    integer,
    isRecord,
    readJsonObject,
    requiredText,
} from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import { publicOrderMetadataDefinitions, withPublicCheckoutMetadata } from "../../core/order-metadata.ts";

export async function getCart(request: Request): Promise<Response> {
    const result = await rpc("get_cart", {
        p_buyer_cms_user_id: cmsUserId(request),
    });
    return json(camelize(result));
}

export async function upsertCartItem(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("upsert_cart_item", {
        p_buyer_cms_user_id: cmsUserId(request),
        p_offer_id: integer(body.offerId, "offerId", true),
        p_quantity: integer(body.quantity, "quantity", true),
        p_expected_version: integer(body.expectedVersion, "expectedVersion"),
    });
    return json(camelize(result));
}

export async function removeCartItem(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const result = await rpc("remove_cart_item", {
        p_buyer_cms_user_id: cmsUserId(request),
        p_offer_id: integer(params.get("offerId"), "offerId", true),
        p_expected_version: integer(params.get("expectedVersion"), "expectedVersion", true),
    });
    return json(camelize(result));
}

export async function clearCart(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("clear_cart", {
        p_buyer_cms_user_id: cmsUserId(request),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
    });
    return json(camelize(result));
}

export async function checkoutCart(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    assertOptionalObjects(body);
    const buyerCmsUserId = cmsUserId(request);
    const expectedVersion = integer(body.expectedVersion, "expectedVersion", true);
    const idempotencyKey = requiredText(body.idempotencyKey, "idempotencyKey");
    const definitions = await publicOrderMetadataDefinitions();
    const checkout = await rpc("checkout_cart", {
        p_buyer_cms_user_id: buyerCmsUserId,
        p_expected_version: expectedVersion,
        p_idempotency_key: idempotencyKey,
        p_shipping_address: isRecord(body.shippingAddress) ? body.shippingAddress : {},
        p_billing_address: isRecord(body.billingAddress) ? body.billingAddress : {},
        p_metadata: isRecord(body.metadata) ? body.metadata : {},
    });
    const result = withPublicCheckoutMetadata(camelize(checkout), definitions);
    const replay = isRecord(result) && result.idempotentReplay === true;
    return json(result, replay ? 200 : 201);
}

function assertOptionalObjects(body: Record<string, unknown>): void {
    for (const key of ["shippingAddress", "billingAddress", "metadata"] as const) {
        if (body[key] !== undefined && !isRecord(body[key])) {
            throw new HttpError(400, `${key} must be an object`);
        }
    }
}
