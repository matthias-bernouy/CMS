import {
    HttpError,
    json,
    readJsonObject,
    requireCmsRequest,
    requireCmsWriteRequest,
    requiredQuery,
} from "../../http.ts";
import { stringValue } from "../../shipment/payload/index.ts";
import { deliveryQuoteRow } from "../../shipment/supabase/index.ts";
import { requiredBodyText } from "../body.ts";
import { deliveryQuoteJson } from "./presentation.ts";
import { optionalMinorAmount, optionalPositiveInteger } from "./validation.ts";

export async function resolveDeliveryQuote(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const quoteId = requiredBodyText(body, "quoteId", 80);
    const externalOrderId = requiredBodyText(body, "externalOrderId", 200);
    const selectedForCmsUserId = requiredBodyText(body, "selectedForCmsUserId", 512);
    const row = await deliveryQuoteRow(quoteId);
    if (!row || row.external_order_id !== externalOrderId || row.selected_for_cms_user_id !== selectedForCmsUserId) {
        throw new HttpError(404, "delivery quote not found for the exact order and buyer");
    }
    const expectedOrderVersion = optionalPositiveInteger(body.orderVersion, "orderVersion");
    if (expectedOrderVersion !== null && row.order_version !== expectedOrderVersion) {
        throw new HttpError(409, "delivery quote order version mismatch");
    }
    const expectedMerchandise = optionalMinorAmount(
        body.merchandiseSubtotalMinorAmount,
        "merchandiseSubtotalMinorAmount",
    );
    if (expectedMerchandise !== null && row.merchandise_subtotal_minor_amount !== expectedMerchandise) {
        throw new HttpError(409, "delivery quote merchandise value mismatch");
    }
    const expectedCurrency = stringValue(body.currency).toLowerCase();
    if (expectedCurrency && row.currency !== expectedCurrency) {
        throw new HttpError(409, "delivery quote currency mismatch");
    }
    const purpose = stringValue(body.purpose) || "fulfillment";
    if (purpose === "financial_lock" && Date.parse(String(row.expires_at)) <= Date.now()) {
        throw new HttpError(409, "delivery quote expired before financial terms were locked");
    }
    if (!["financial_lock", "fulfillment", "claim_return"].includes(purpose)) {
        throw new HttpError(400, "delivery quote purpose is invalid");
    }
    return json({
        ...deliveryQuoteJson(row),
        recipientSnapshot: row.recipient_snapshot,
        sellerFulfillmentSnapshot: row.seller_fulfillment_snapshot,
    });
}

export async function publicDeliveryQuote(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const quoteId = requiredQuery(url, "quoteId");
    const externalOrderId = requiredQuery(url, "externalOrderId");
    const selectedForCmsUserId = requiredQuery(url, "selectedForCmsUserId");
    const row = await deliveryQuoteRow(quoteId);
    if (!row || row.external_order_id !== externalOrderId || row.selected_for_cms_user_id !== selectedForCmsUserId) {
        throw new HttpError(404, "delivery quote not found for the exact order and buyer");
    }
    return json(deliveryQuoteJson(row));
}
