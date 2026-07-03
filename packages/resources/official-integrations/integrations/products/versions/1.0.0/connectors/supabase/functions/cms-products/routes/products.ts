import { HttpError } from "../core/errors.ts";
import { requireCmsRequest } from "../core/auth.ts";
import { json } from "../core/http.ts";
import { appendEqualQuery, appendTextSearch, limitParam, listQuery, listResponse, offsetParam, queryText } from "../core/query.ts";
import { productDetail } from "./productDetail.ts";
import { getOne, restJson, rowByIdOrSlug } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";

const productSelect = "id,slug,title,description,brand_id,status,visibility,metadata,created_at,updated_at";

export async function products(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const query = listQuery(productSelect, url, "updated_at.desc");
    appendEqualQuery(query, "brand_id", queryText(url, "brandId"));
    appendEqualQuery(query, "status", queryText(url, "status"));
    appendEqualQuery(query, "visibility", queryText(url, "visibility"));
    appendTextSearch(query, url, ["title", "slug", "description"]);

    const categoryId = await categoryIdFromUrl(url);
    if (categoryId === null) return json(emptyList(url));
    if (categoryId !== undefined) {
        const links = await restJson<JsonRecord[]>(
            `product_categories?select=product_id&category_id=eq.${encodeURIComponent(String(categoryId))}&limit=1000`,
            { method: "GET" },
        );
        const ids = links.map(row => row.product_id).filter(value => value !== undefined && value !== null);
        if (!ids.length) return json(emptyList(url));
        query.set("id", `in.(${ids.map(value => String(value)).join(",")})`);
    }

    const rows = await restJson<JsonRecord[]>(`products?${query.toString()}`, { method: "GET" });
    return json(listResponse(rows, url));
}

export async function product(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const row = await rowByIdOrSlug("products", new URL(request.url), productSelect);
    if (!row) throw new HttpError(404, "product not found");
    return json(await productDetail(row));
}

async function categoryIdFromUrl(url: URL): Promise<unknown | null | undefined> {
    const explicit = url.searchParams.get("categoryId");
    if (explicit) return explicit;
    const fullSlug = url.searchParams.get("categoryFullSlug");
    if (!fullSlug) return undefined;
    const row = await getOne("categories", { full_slug: fullSlug }, "id");
    return row ? row.id : null;
}

function emptyList(url: URL): JsonRecord {
    return { items: [], limit: limitParam(url, 50), offset: offsetParam(url) };
}
