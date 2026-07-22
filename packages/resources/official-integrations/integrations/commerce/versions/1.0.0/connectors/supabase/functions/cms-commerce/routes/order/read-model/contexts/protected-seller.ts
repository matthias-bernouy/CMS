import { HttpError } from "../../../../core/errors.ts";
import { isRecord, text } from "../../../../core/records.ts";
import { rpc } from "../../../../core/rest.ts";
import type { JsonRecord } from "../../../../core/types.ts";

const functionName = "get_protected_seller_context";
type SellerContextScope = "checkout" | "payment";

export async function loadProtectedSellerContext(
    scope: SellerContextScope,
    parameters: JsonRecord,
    expectedBuyerCmsUserId: string | undefined,
): Promise<JsonRecord> {
    const result = await rpc(functionName, parameters);
    if (!isRecord(result) || typeof result.state !== "string") {
        throw invalidResponse();
    }
    if (result.state !== "ok") {
        throw contextError(scope, result.state);
    }
    if (!isRecord(result.context)) {
        throw invalidResponse();
    }
    const sellerCmsUserId = text(result.context.seller_cms_user_id);
    const buyerCmsUserId = text(result.context.buyer_cms_user_id);
    if (!sellerCmsUserId || !expectedBuyerCmsUserId || buyerCmsUserId !== expectedBuyerCmsUserId) {
        throw invalidResponse();
    }
    return { sellerCmsUserId, buyerCmsUserId: expectedBuyerCmsUserId };
}

function contextError(scope: SellerContextScope, state: string): HttpError {
    if (state === "identity_required") {
        return new HttpError(401, "missing CMS user id");
    }
    if (state === "seller_unavailable") {
        return new HttpError(409, "protected marketplace seller identity is unavailable");
    }
    if (scope === "checkout" && state === "offer_not_found") {
        return new HttpError(404, "offer not found");
    }
    if (scope === "checkout" && state === "multiple_sellers") {
        return new HttpError(409, "one protected order cannot contain multiple sellers");
    }
    if (scope === "payment" && state === "order_not_found") {
        return new HttpError(404, "order not found");
    }
    return invalidResponse();
}

function invalidResponse(): HttpError {
    return new HttpError(502, `${functionName} returned an invalid response`);
}
