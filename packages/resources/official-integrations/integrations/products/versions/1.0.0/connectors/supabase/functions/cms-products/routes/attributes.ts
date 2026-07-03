import { HttpError } from "../core/errors.ts";
import { requireCmsRequest } from "../core/auth.ts";
import { json } from "../core/http.ts";
import { appendEqualQuery, appendTextSearch, listQuery, listResponse, queryText } from "../core/query.ts";
import { camelizeRecord } from "../core/records.ts";
import { getOne, restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";

const attributeSelect = "id,code,name,description,data_type,created_at,updated_at";

export async function attributes(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const query = listQuery(attributeSelect, url, "name.asc");
    appendTextSearch(query, url, ["name", "code"]);
    const rows = await restJson<JsonRecord[]>(`attributes?${query.toString()}`, { method: "GET" });
    return json(listResponse(rows, url));
}

export async function attribute(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const code = url.searchParams.get("code");
    if (!id && !code) throw new HttpError(400, "id or code is required");
    const row = id
        ? await getOne("attributes", { id }, attributeSelect)
        : await getOne("attributes", { code: code! }, attributeSelect);
    if (!row) throw new HttpError(404, "attribute not found");
    const options = await restJson<JsonRecord[]>(
        `attribute_options?attribute_id=eq.${row.id}&select=${encodeURIComponent("id,attribute_id,value,label,position,created_at")}&order=position.asc`,
        { method: "GET" },
    );
    return json({
        ...camelizeRecord(row),
        options: options.map(camelizeRecord),
        optionsSummary: optionSummary(options),
    });
}

export async function attributeOptions(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const query = listQuery("id,attribute_id,value,label,position,created_at", url, "position.asc");
    appendEqualQuery(query, "attribute_id", queryText(url, "attributeId"));
    const rows = await restJson<JsonRecord[]>(`attribute_options?${query.toString()}`, { method: "GET" });
    return json(listResponse(rows, url));
}

function optionSummary(options: JsonRecord[]): string {
    return options
        .map(option => option.label || option.value)
        .filter(value => value !== undefined && value !== null && value !== "")
        .map(String)
        .join(", ");
}
