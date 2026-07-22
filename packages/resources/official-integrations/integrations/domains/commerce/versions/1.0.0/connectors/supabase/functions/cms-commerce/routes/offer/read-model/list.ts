import { json } from "../../../core/http.ts";
import { camelize, integer, text } from "../../../core/records.ts";
import { listRows } from "../../../core/rest.ts";
import { addFilter } from "../helpers.ts";
import { hasContextualFilters, listContextualOffers } from "./contextual-list.ts";
import { listPublicOfferReadModel } from "./public.ts";
import { listSellerOfferReadModel } from "./seller.ts";

const offerSelect =
    "id,seller_id,product_id,variant_id,slug,title,description,condition_code,publication_status,workflow_state,accepted_price_amount,currency,availability,quantity_available,metadata,version,created_at,updated_at";

export async function listOffers(request: Request, scope: "public" | "admin" | "self"): Promise<Response> {
    const url = new URL(request.url);
    if (scope === "public" && hasContextualFilters(url)) {
        return await listContextualOffers(url);
    }
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    if (scope === "public") {
        return await listPublicOfferReadModel(url, limit, offset);
    }
    if (scope === "self") {
        return await listSellerOfferReadModel(request, url, limit, offset);
    }
    const params = new URLSearchParams({
        select: offerSelect,
        order: "updated_at.desc,id.desc",
        limit: String(limit),
        offset: String(offset),
    });
    addFilter(params, "publication_status", url.searchParams.get("publicationStatus"), true);
    addFilter(params, "workflow_state", url.searchParams.get("workflowState"), true);
    addFilter(params, "condition_code", url.searchParams.get("conditionCode"), true);
    addFilter(params, "product_id", url.searchParams.get("productId"), true);
    addFilter(params, "variant_id", url.searchParams.get("variantId"), true);
    addFilter(params, "seller_id", url.searchParams.get("sellerId"), true);
    const query = text(url.searchParams.get("q"))?.replace(/[,*()]/g, " ");
    if (query) {
        params.set("or", `(title.ilike.*${query}*,slug.ilike.*${query}*)`);
    }
    const { rows, total } = await listRows(`offers?${params.toString()}`);
    return json({ items: camelize(rows), total, limit, offset });
}
