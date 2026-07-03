import { requireCmsRequest } from "../core/auth.ts";
import { json } from "../core/http.ts";
import {
    appendEqualQuery,
    appendTextSearch,
    listQuery,
    listResponse,
    queryText,
} from "../core/query.ts";
import { camelizeRecord } from "../core/records.ts";
import { restJson, rowByIdOrSlug } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";

const brandSelect = "id,slug,name,description,status,metadata,created_at,updated_at";

export async function brands(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const query = listQuery(brandSelect, url, "name.asc");
    appendEqualQuery(query, "status", queryText(url, "status"));
    appendTextSearch(query, url, ["name", "slug"]);
    const rows = await restJson<JsonRecord[]>(`brands?${query.toString()}`, { method: "GET" });
    return json(listResponse(rows, url));
}

export async function brand(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const row = await rowByIdOrSlug("brands", new URL(request.url), brandSelect);
    if (!row) return json({ error: "brand not found" }, 404);
    return json(camelizeRecord(row));
}
