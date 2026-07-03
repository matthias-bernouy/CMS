import { HttpError } from "../core/errors.ts";
import { requireCmsRequest } from "../core/auth.ts";
import { json } from "../core/http.ts";
import {
    appendEqualQuery,
    appendNullableQuery,
    appendTextSearch,
    listQuery,
    listResponse,
    queryText,
} from "../core/query.ts";
import { camelizeRecord } from "../core/records.ts";
import { getOne, restJson, rowByFilters } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";

const categorySelect = "id,parent_id,slug,full_slug,title,description,position,status,metadata,created_at,updated_at";

export async function categories(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const query = listQuery(categorySelect, url, "position.asc,title.asc");
    appendNullableQuery(query, "parent_id", url.searchParams.get("parentId"));
    appendEqualQuery(query, "status", queryText(url, "status"));
    appendTextSearch(query, url, ["title", "slug", "full_slug"]);
    const rows = await restJson<JsonRecord[]>(`categories?${query.toString()}`, { method: "GET" });
    return json(listResponse(rows, url));
}

export async function category(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const row = await rowByFilters("categories", categorySelect, categoryFilters(new URL(request.url)));
    if (!row) throw new HttpError(404, "category not found");
    const parent = row.parent_id ? await getOne("categories", { id: row.parent_id }, "id,slug,full_slug,title") : null;
    return json({
        ...camelizeRecord(row),
        parent: parent ? camelizeRecord(parent) : null,
    });
}

function categoryFilters(url: URL): JsonRecord {
    const id = url.searchParams.get("id");
    const fullSlug = url.searchParams.get("fullSlug");
    if (id) return { id };
    if (fullSlug) return { full_slug: fullSlug };
    return {};
}
