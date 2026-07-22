import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, isRecord, text } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";

export async function listPublicOfferReadModel(url: URL, limit: number, offset: number): Promise<Response> {
    const query = text(url.searchParams.get("q"))?.replace(/[,*()]/g, " ");
    const sort = url.searchParams.get("sort");
    const result = await rpc("list_public_offers_read_model", {
        p_workflow_state: text(url.searchParams.get("workflowState")),
        p_condition_code: text(url.searchParams.get("conditionCode")),
        p_product_id: text(url.searchParams.get("productId")),
        p_variant_id: text(url.searchParams.get("variantId")),
        p_seller_id: text(url.searchParams.get("sellerId")),
        p_price_min: publicOfferAmount(url.searchParams.get("priceMin")),
        p_price_max: publicOfferAmount(url.searchParams.get("priceMax")),
        p_query: query,
        p_sort: sort ?? undefined,
        p_limit: limit,
        p_offset: offset,
    });
    const readModel = requireReadModel(result, "list_public_offers_read_model");
    if (!Array.isArray(readModel.items) || readModel.items.some((item) => !isRecord(item))) {
        throw new HttpError(502, "list_public_offers_read_model returned an invalid response");
    }
    const total = Number(readModel.total);
    if (!Number.isSafeInteger(total) || total < 0) {
        throw new HttpError(502, "list_public_offers_read_model returned an invalid response");
    }
    return json({ items: camelize(readModel.items), total, limit, offset });
}

export async function getPublicOfferReadModel(id: number | null, slug: string | undefined): Promise<Response> {
    const result = await rpc("get_public_offer_read_model", {
        p_offer_id: id ?? undefined,
        p_slug: slug,
    });
    if (
        !isRecord(result) ||
        typeof result.candidate_exists !== "boolean" ||
        typeof result.settings_available !== "boolean"
    ) {
        throw new HttpError(502, "get_public_offer_read_model returned an invalid response");
    }
    if (!result.candidate_exists) {
        throw new HttpError(404, "offer not found");
    }
    if (!result.settings_available) {
        throw new HttpError(502, "commerce settings are unavailable");
    }
    const readModel = result;
    if (readModel.offer === null) {
        throw new HttpError(404, "offer not found");
    }
    if (!isRecord(readModel.offer)) {
        throw new HttpError(502, "get_public_offer_read_model returned an invalid response");
    }
    return json(camelize(readModel.offer));
}

function publicOfferAmount(raw: string | null): number | undefined {
    const euros = Number(raw);
    return raw && Number.isFinite(euros) && euros >= 0 ? Math.round(euros * 100) : undefined;
}

function requireReadModel(value: unknown, name: string): Record<string, unknown> {
    if (!isRecord(value) || typeof value.settings_available !== "boolean") {
        throw new HttpError(502, `${name} returned an invalid response`);
    }
    if (!value.settings_available) {
        throw new HttpError(502, "commerce settings are unavailable");
    }
    return value;
}
