import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { camelize, integer } from "../../core/records.ts";
import { listRows, restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { catalogRequirementProjection } from "../../services/catalog.ts";
import { listQuery } from "../../services/query.ts";

export async function listVariantFeatures(request: Request): Promise<Response> {
    const query = listQuery(request);
    const params = listParams(query, "sort_order.asc,variant_item_id.asc,feature_item_id.asc");
    const url = new URL(request.url);
    const variantId = integer(url.searchParams.get("variantItemId"), "variantItemId");
    const featureId = integer(url.searchParams.get("featureItemId"), "featureItemId");
    addExactFilter(params, "variant_item_id", variantId);
    addExactFilter(params, "feature_item_id", featureId);
    if (!(await addSearchFilter(params, query.query, "variant_item_id", "feature_item_id"))) {
        return emptyList(query);
    }
    const { rows, total } = await listRows(`variant_features?${params}`);
    const items = await catalogItemsFor(rows, "variant_item_id", "feature_item_id");
    const hydrated = rows.map((row) => ({
        ...row,
        variant_name: items.get(Number(row.variant_item_id))?.name,
        feature_name: items.get(Number(row.feature_item_id))?.name,
    }));
    return relationshipList(hydrated, total, query, Boolean(variantId && featureId));
}

export async function listRequirements(request: Request): Promise<Response> {
    const query = listQuery(request);
    const params = listParams(query, "created_at.desc,subject_item_id.asc");
    const url = new URL(request.url);
    const subjectId = integer(url.searchParams.get("subjectItemId"), "subjectItemId");
    const requiredId = integer(url.searchParams.get("requiredItemId"), "requiredItemId");
    addExactFilter(params, "subject_item_id", subjectId);
    addExactFilter(params, "required_item_id", requiredId);
    if (!(await addSearchFilter(params, query.query, "subject_item_id", "required_item_id"))) {
        return emptyList(query);
    }
    const { rows, total } = await listRows(`catalog_requirements?${params}`);
    const items = await catalogItemsFor(rows, "subject_item_id", "required_item_id");
    const hydrated = rows.map((row) => catalogRequirementProjection(row, items));
    return relationshipList(hydrated, total, query, Boolean(subjectId && requiredId));
}

export async function requirementByIds(subjectItemId: number, requiredItemId: number): Promise<JsonRecord> {
    const items = await catalogItemsFor(
        [{ subject_item_id: subjectItemId, required_item_id: requiredItemId }],
        "subject_item_id",
        "required_item_id",
    );
    if (!items.has(subjectItemId) || !items.has(requiredItemId)) {
        throw new HttpError(502, "catalog requirement items are incomplete");
    }
    return camelize(
        catalogRequirementProjection({ subject_item_id: subjectItemId, required_item_id: requiredItemId }, items),
    ) as JsonRecord;
}

async function addSearchFilter(
    params: URLSearchParams,
    query: string | undefined,
    left: string,
    right: string,
): Promise<boolean> {
    const ids = await matchingCatalogItemIds(query);
    if (!ids) {
        return true;
    }
    if (!ids.length) {
        return false;
    }
    const filter = `in.(${ids.join(",")})`;
    params.set("or", `(${left}.${filter},${right}.${filter})`);
    return true;
}

async function matchingCatalogItemIds(query: string | undefined): Promise<number[] | undefined> {
    if (!query) {
        return undefined;
    }
    const params = new URLSearchParams({
        select: "id",
        or: `(name.ilike.*${query}*,code.ilike.*${query}*)`,
        limit: "1000",
    });
    const rows = await restJson<JsonRecord[]>(`catalog_items?${params}`);
    return rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

async function catalogItemsFor(rows: JsonRecord[], ...fields: string[]): Promise<Map<number, JsonRecord>> {
    const ids = [
        ...new Set(rows.flatMap((row) => fields.map((field) => Number(row[field]))).filter(Number.isSafeInteger)),
    ];
    if (!ids.length) {
        return new Map();
    }
    const items = await restJson<JsonRecord[]>(`catalog_items?select=id,kind,code,name&id=in.(${ids.join(",")})`);
    return new Map(items.map((item) => [Number(item.id), item]));
}

function listParams(query: ReturnType<typeof listQuery>, order: string): URLSearchParams {
    return new URLSearchParams({
        select: "*",
        order,
        limit: String(query.limit),
        offset: String(query.offset),
    });
}

function addExactFilter(params: URLSearchParams, field: string, value: number | undefined): void {
    if (value) {
        params.set(field, `eq.${value}`);
    }
}

function relationshipList(
    rows: JsonRecord[],
    total: number,
    query: ReturnType<typeof listQuery>,
    includeItem: boolean,
): Response {
    return json({
        items: camelize(rows),
        ...(includeItem && rows[0] ? { item: camelize(rows[0]) } : {}),
        total,
        limit: query.limit,
        offset: query.offset,
    });
}

function emptyList(query: ReturnType<typeof listQuery>): Response {
    return json({ items: [], total: 0, limit: query.limit, offset: query.offset });
}
