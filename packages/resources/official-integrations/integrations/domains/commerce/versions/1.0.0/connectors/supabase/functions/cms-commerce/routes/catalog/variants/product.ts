import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, integer } from "../../../core/records.ts";
import { listRows, one } from "../../../core/rest.ts";

const select = "id,product_id,sku,title,status,position,combination_key,version,created_at,updated_at";

export async function listProductVariants(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const productId = integer(url.searchParams.get("productId"), "productId", true)!;
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 100, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const params = new URLSearchParams({
        select,
        product_id: `eq.${productId}`,
        status: "eq.active",
        combination_key: "not.is.null",
        order: "position.asc,id.asc",
        limit: String(limit),
        offset: String(offset),
    });
    const query = url.searchParams
        .get("q")
        ?.trim()
        .replace(/[,*()]/g, " ");
    if (query) {
        params.set("or", `(title.ilike.*${query}*,sku.ilike.*${query}*)`);
    }
    const { rows, total } = await listRows(`product_variants?${params.toString()}`);
    return json({ items: camelize(rows), total, limit, offset });
}

export async function getProductVariant(request: Request): Promise<Response> {
    const id = integer(new URL(request.url).searchParams.get("id"), "id", true)!;
    const row = await one("product_variants", { id }, select);
    if (!row || row.status !== "active" || !row.combination_key) {
        throw new HttpError(404, "product variant not found");
    }
    return json(camelize(row));
}
