import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { camelize, integer, isRecord, readJsonObject, requiredText, text } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { publicOrderMetadataDefinitions, withPublicOrderResult } from "../../core/order-metadata.ts";
import { loadProtectedSellerContext } from "./read-model/contexts/protected-seller.ts";

const paymentContextFunctionName = "get_order_payment_context";
const paymentContextFields = ["id", "public_id", "buyer_cms_user_id"] as const;

export async function createOrder(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    for (const key of ["shippingAddress", "billingAddress", "metadata"] as const) {
        if (body[key] !== undefined && !isRecord(body[key])) {
            throw new HttpError(400, `${key} must be an object`);
        }
    }
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items || items.some((item) => !isRecord(item))) {
        throw new HttpError(400, "items must be an array of objects");
    }
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
    if (!items?.length || items.some((item) => !isRecord(item))) {
        throw new HttpError(400, "items must be a non-empty array of objects");
    }
    const offerIds = [
        ...new Set(
            items.map((item, index) => {
                const offerId = integer((item as JsonRecord).offerId, `items.${index}.offerId`, true)!;
                if (offerId < 1) {
                    throw new HttpError(400, `items.${index}.offerId must be positive`);
                }
                return offerId;
            }),
        ),
    ];
    const buyerCmsUserId = text(request.headers.get("x-cms-user-id"));
    return json(
        await loadProtectedSellerContext(
            "checkout",
            {
                p_scope: "checkout",
                p_offer_ids: offerIds,
                p_order_id: null,
                p_buyer_cms_user_id: buyerCmsUserId ?? null,
            },
            buyerCmsUserId,
        ),
    );
}

export async function getProtectedPaymentSellerContext(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const orderId = integer(body.orderId, "orderId", true)!;
    if (orderId < 1) {
        throw new HttpError(400, "orderId must be positive");
    }
    const buyerCmsUserId = cmsUserId(request);
    return json(
        await loadProtectedSellerContext(
            "payment",
            {
                p_scope: "payment",
                p_offer_ids: null,
                p_order_id: orderId,
                p_buyer_cms_user_id: buyerCmsUserId,
            },
            buyerCmsUserId,
        ),
    );
}

export async function getOrderPaymentContext(request: Request): Promise<Response> {
    const orderId = integer(new URL(request.url).searchParams.get("orderId"), "orderId", true)!;
    const result = await rpc(paymentContextFunctionName, {
        p_order_id: orderId,
        p_buyer_cms_user_id: cmsUserId(request),
    });
    if (!isRecord(result) || typeof result.state !== "string") {
        throw invalidPaymentContext();
    }
    if (result.state === "identity_required") {
        throw new HttpError(401, "missing CMS user id");
    }
    if (result.state === "not_found") {
        throw new HttpError(404, "order not found");
    }
    if (result.state !== "ok") {
        throw invalidPaymentContext();
    }
    return json(projectPaymentContext(result.context));
}

function projectPaymentContext(value: unknown): JsonRecord {
    if (
        !isRecord(value) ||
        paymentContextFields.some((field) => !Object.hasOwn(value, field)) ||
        !Number.isSafeInteger(value.id) ||
        typeof value.public_id !== "string" ||
        typeof value.buyer_cms_user_id !== "string"
    ) {
        throw invalidPaymentContext();
    }
    return {
        id: value.id,
        publicId: value.public_id,
        buyerCmsUserId: value.buyer_cms_user_id,
    };
}

function invalidPaymentContext(): HttpError {
    return new HttpError(502, `${paymentContextFunctionName} returned an invalid response`);
}

function withoutRequestHash(value: unknown): unknown {
    if (!isRecord(value)) {
        return value;
    }
    const response = { ...value };
    delete response.requestHash;
    return response;
}
