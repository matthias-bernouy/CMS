import { cmsUserId } from "../../../../core/auth.ts";
import { HttpError } from "../../../../core/errors.ts";
import { json } from "../../../../core/http.ts";
import { camelize, integer, isRecord } from "../../../../core/records.ts";
import { rpc } from "../../../../core/rest.ts";
import type { JsonRecord } from "../../../../core/types.ts";

const deliverySetupFunction = "get_order_delivery_setup_context";
const deliverySelectionFunction = "get_order_delivery_selection_context";
const setupOrderFields = [
    "public_id", "buyer_cms_user_id", "status", "version",
] as const;
const setupAuthorizationFields = [
    "buyer_cms_user_id", "status", "order_version", "seller_cms_user_id",
    "currency", "merchandise_subtotal_minor_amount", "shipping_address",
] as const;
const selectionFields = [
    "public_id", "buyer_cms_user_id", "delivery_quote_id",
] as const;

export async function getOrderDeliverySetupContext(
    request: Request,
): Promise<Response> {
    const [context, actor] =
        await loadDeliveryContext(request, deliverySetupFunction);
    if (context.state === "seller_unavailable") {
        throw new HttpError(
            409,
            "protected delivery requires a C2C user seller",
        );
    }
    if (context.state !== "ok") throw invalidResponse(deliverySetupFunction);
    return json(projectDeliverySetupContext(context.context, actor));
}

export async function getOrderDeliverySelectionContext(
    request: Request,
): Promise<Response> {
    const [context, actor] =
        await loadDeliveryContext(request, deliverySelectionFunction);
    if (context.state !== "ok") {
        throw invalidResponse(deliverySelectionFunction);
    }
    return json(projectDeliverySelectionContext(context.context, actor));
}

async function loadDeliveryContext(
    request: Request,
    functionName: string,
): Promise<[JsonRecord, string]> {
    const selector = new URL(request.url).searchParams.get("orderId");
    const orderId = integer(selector, "orderId", true)!;
    const actor = cmsUserId(request);
    const value = await rpc(functionName, {
        p_order_id: orderId,
        p_buyer_cms_user_id: actor,
    });
    if (!isRecord(value) || typeof value.state !== "string") {
        throw invalidResponse(functionName);
    }
    if (value.state === "identity_required") {
        throw new HttpError(401, "missing CMS user id");
    }
    if (value.state === "not_found") {
        throw new HttpError(404, "order not found");
    }
    return [value, actor];
}

function projectDeliverySetupContext(
    value: unknown,
    actor: string,
): JsonRecord {
    if (!isRecord(value)) throw invalidResponse(deliverySetupFunction);
    const order = value.order;
    const authorization = value.authorization;
    if (
        !hasFields(order, setupOrderFields)
        || typeof order.public_id !== "string"
        || order.buyer_cms_user_id !== actor
        || typeof order.status !== "string"
        || !Number.isSafeInteger(order.version)
        || (authorization !== null && !validSetupAuthorization(authorization))
        || (authorization === null) === (order.status === "awaiting_quote")
        || (authorization !== null && (
            authorization.buyer_cms_user_id !== order.buyer_cms_user_id
            || authorization.status !== order.status
            || authorization.order_version !== order.version
        ))
    ) {
        throw invalidResponse(deliverySetupFunction);
    }
    return {
        order: {
            publicId: order.public_id,
            buyerCmsUserId: order.buyer_cms_user_id,
            status: order.status,
            version: order.version,
        },
        authorization: authorization === null ? null : {
            buyerCmsUserId: authorization.buyer_cms_user_id,
            status: authorization.status,
            orderVersion: authorization.order_version,
            sellerCmsUserId: authorization.seller_cms_user_id,
            currency: authorization.currency,
            merchandiseSubtotalMinorAmount:
                authorization.merchandise_subtotal_minor_amount,
            shippingAddress: camelize(authorization.shipping_address),
        },
    };
}

function validSetupAuthorization(value: unknown): value is JsonRecord {
    return hasFields(value, setupAuthorizationFields)
        && typeof value.buyer_cms_user_id === "string"
        && typeof value.status === "string"
        && Number.isSafeInteger(value.order_version)
        && typeof value.seller_cms_user_id === "string"
        && typeof value.currency === "string"
        && Number.isSafeInteger(value.merchandise_subtotal_minor_amount)
        && isRecord(value.shipping_address);
}

function projectDeliverySelectionContext(
    value: unknown,
    actor: string,
): JsonRecord {
    if (
        !hasFields(value, selectionFields)
        || typeof value.public_id !== "string"
        || value.buyer_cms_user_id !== actor
        || (value.delivery_quote_id !== null
            && typeof value.delivery_quote_id !== "string")
    ) {
        throw invalidResponse(deliverySelectionFunction);
    }
    return {
        publicId: value.public_id,
        buyerCmsUserId: value.buyer_cms_user_id,
        deliveryQuoteId: value.delivery_quote_id,
    };
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
