import { json } from "../../core/http.ts";
import { integer, text } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";

export async function estimateOfferPrice(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const result = await rpc("estimate_offer_price", {
        p_product_id: integer(url.searchParams.get("productId"), "productId", true),
        p_variant_id: integer(url.searchParams.get("variantId"), "variantId"),
        p_condition_code: text(url.searchParams.get("conditionCode")) ?? null,
    });
    return json(result);
}
