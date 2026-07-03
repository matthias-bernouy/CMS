import { HttpError } from "../core/errors.ts";
import { requireCmsRequest } from "../core/auth.ts";
import { json } from "../core/http.ts";
import { appendEqualQuery, appendTextSearch, listQuery, listResponse, queryText, requiredPositiveInteger } from "../core/query.ts";
import { camelizeRecord } from "../core/records.ts";
import { getOne, restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { enrichVariant, enrichVariants, variantSelect } from "./variantDetails.ts";

export async function variants(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const query = listQuery(variantSelect, url, "position.asc");
    appendEqualQuery(query, "product_id", queryText(url, "productId"));
    appendEqualQuery(query, "status", queryText(url, "status"));
    appendTextSearch(query, url, ["sku", "title"]);
    const rows = await restJson<JsonRecord[]>(`product_variants?${query.toString()}`, { method: "GET" });
    return json(listResponse(await enrichVariants(rows), url));
}

export async function variant(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const id = requiredPositiveInteger(new URL(request.url).searchParams.get("id"), "id");
    const row = await getOne("product_variants", { id }, variantSelect);
    if (!row) throw new HttpError(404, "variant not found");
    const [product, detail] = await Promise.all([getOne("products", { id: row.product_id }, "id,slug,title"), enrichVariant(row)]);
    return json({
        ...detail,
        product: product ? camelizeRecord(product) : null,
    });
}
