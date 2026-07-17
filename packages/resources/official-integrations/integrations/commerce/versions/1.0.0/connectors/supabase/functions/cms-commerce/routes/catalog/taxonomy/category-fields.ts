import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, integer, isRecord, readJsonObject, text } from "../../../core/records.ts";
import { restJson, rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";

export async function listCategoryFields(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const categoryId = integer(url.searchParams.get("categoryId"), "categoryId", true)!;
    const rows = await categoryFields(categoryId);
    return json({ items: camelize(rows), total: rows.length });
}

export async function categoryFields(categoryId: number): Promise<JsonRecord[]> {
    const params = new URLSearchParams({
        category_id: `eq.${categoryId}`,
        select: "category_id,field_key,required,filterable,position,definition:custom_field_definitions(label,field_type,options,unit,public_readable,enabled)",
        order: "position.asc,field_key.asc",
    });
    return restJson<JsonRecord[]>(`category_custom_fields?${params.toString()}`);
}

export async function upsertCategoryField(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("upsert_category_custom_field", {
        p_category_id: integer(body.categoryId, "categoryId", true),
        p_field_key: text(body.fieldKey),
        p_required: body.required === true,
        p_filterable: body.filterable === true,
        p_position: integer(body.position, "position") ?? 0,
        p_unit: null,
        p_operators: [],
    });
    if (!isRecord(result)) throw new HttpError(502, "upsert_category_custom_field returned an invalid response");
    return json(camelize(result));
}

export async function getOfferFilterSchema(request: Request): Promise<Response> {
    const category = text(new URL(request.url).searchParams.get("category"));
    if (!category) throw new HttpError(400, "category is required");
    const result = await rpc("get_offer_filter_schema_read_model", {
        p_category_full_slug: category,
    });
    if (!isRecord(result)) throw new HttpError(404, "category not found");
    return json(result);
}

export async function getCategoryProductFieldSchema(request: Request): Promise<Response> {
    const categoryId = integer(new URL(request.url).searchParams.get("categoryId"), "categoryId", true)!;
    const result = await rpc("category_custom_field_schema", { p_category_id: categoryId });
    if (!isRecord(result) || !Array.isArray(result.fields)) throw new HttpError(404, "category schema not found");
    return json(camelize(result));
}
