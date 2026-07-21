import { cmsUserId } from "../../../../core/auth.ts";
import { HttpError } from "../../../../core/errors.ts";
import { json } from "../../../../core/http.ts";
import { integer, isRecord } from "../../../../core/records.ts";
import { rpc } from "../../../../core/rest.ts";
import type { JsonRecord } from "../../../../core/types.ts";

const fulfillmentFunction = "get_order_fulfillment_seller_context";
const shipmentCreationFunction =
    "get_order_shipment_creation_seller_context";
const labelFunction = "get_order_label_seller_context";
const fulfillmentFields = ["id", "public_id", "order_number"] as const;
const shipmentCreationFields = [
    "id", "public_id", "allowed", "seller_cms_user_id",
] as const;
const labelFields = ["public_id", "allowed", "seller_cms_user_id"] as const;

export async function getOrderFulfillmentSellerContext(
    request: Request,
): Promise<Response> {
    const context = await loadSellerContext(request, fulfillmentFunction);
    if (
        !hasFields(context, fulfillmentFields)
        || !Number.isSafeInteger(context.id)
        || typeof context.public_id !== "string"
        || typeof context.order_number !== "string"
    ) {
        throw invalidResponse(fulfillmentFunction);
    }
    return json({
        id: context.id,
        publicId: context.public_id,
        orderNumber: context.order_number,
    });
}

export async function getOrderShipmentCreationSellerContext(
    request: Request,
): Promise<Response> {
    const context = await loadSellerContext(request, shipmentCreationFunction);
    if (
        !hasFields(context, shipmentCreationFields)
        || !Number.isSafeInteger(context.id)
        || typeof context.public_id !== "string"
        || typeof context.allowed !== "boolean"
        || typeof context.seller_cms_user_id !== "string"
    ) {
        throw invalidResponse(shipmentCreationFunction);
    }
    return json({
        id: context.id,
        publicId: context.public_id,
        allowed: context.allowed,
        sellerId: context.seller_cms_user_id,
    });
}

export async function getOrderLabelSellerContext(
    request: Request,
): Promise<Response> {
    const context = await loadSellerContext(request, labelFunction);
    if (
        !hasFields(context, labelFields)
        || typeof context.public_id !== "string"
        || typeof context.allowed !== "boolean"
        || typeof context.seller_cms_user_id !== "string"
    ) {
        throw invalidResponse(labelFunction);
    }
    return json({
        publicId: context.public_id,
        allowed: context.allowed,
        sellerCmsUserId: context.seller_cms_user_id,
    });
}

async function loadSellerContext(
    request: Request,
    functionName: string,
): Promise<JsonRecord> {
    const selector = new URL(request.url).searchParams.get("orderId");
    const orderId = integer(selector, "orderId", true)!;
    const actor = cmsUserId(request);
    const value = await rpc(functionName, {
        p_order_id: orderId,
        p_seller_cms_user_id: actor,
    });
    if (!isRecord(value) || typeof value.state !== "string") {
        throw invalidResponse(functionName);
    }
    if (value.state === "identity_required") {
        throw new HttpError(401, "missing CMS user id");
    }
    if (value.state === "not_found") {
        throw new HttpError(404, "sale not found");
    }
    if (value.state !== "ok" || !isRecord(value.context)) {
        throw invalidResponse(functionName);
    }
    return value.context;
}

function hasFields(
    value: unknown,
    fields: readonly string[],
): value is JsonRecord {
    return isRecord(value) && fields.every(field => Object.hasOwn(value, field));
}

function invalidResponse(functionName: string): HttpError {
    return new HttpError(502, `${functionName} returned an invalid response`);
}
