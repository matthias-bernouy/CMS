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
    const selection = relationshipSelection(url.searchParams.get("id"), "variant feature");
    if (selection === "new") {
        return relationshipDraft(
            {
                id: "__new__",
                variantItemId: null,
                variantName: null,
                variant: null,
                featureItemId: null,
                featureName: null,
                feature: null,
                availability: "included",
                pricingMode: "included",
                unitAmountCents: null,
                sortOrder: 0,
            },
            query,
        );
    }
    const variantId = selection?.left ?? integer(url.searchParams.get("variantItemId"), "variantItemId");
    const featureId = selection?.right ?? integer(url.searchParams.get("featureItemId"), "featureItemId");
    addExactFilter(params, "variant_item_id", variantId);
    addExactFilter(params, "feature_item_id", featureId);
    if (!(await addSearchFilter(params, query.query, "variant_item_id", "feature_item_id"))) {
        return emptyList(query);
    }
    const { rows, total } = await listRows(`variant_features?${params}`);
    const items = await catalogItemsFor(rows, "variant_item_id", "feature_item_id");
    const hydrated = rows.map((row) => {
        const variantItemId = Number(row.variant_item_id);
        const featureItemId = Number(row.feature_item_id);
        const variant = items.get(variantItemId);
        const feature = items.get(featureItemId);
        return {
            ...row,
            id: relationshipId(variantItemId, featureItemId),
            variant_name: variant?.name,
            variant: catalogItemSelection(variant),
            feature_name: feature?.name,
            feature: catalogItemSelection(feature),
        };
    });
    return relationshipList(hydrated, total, query, Boolean(variantId && featureId));
}

export async function listRequirements(request: Request): Promise<Response> {
    const query = listQuery(request);
    const params = listParams(query, "created_at.desc,subject_item_id.asc");
    const url = new URL(request.url);
    const selection = relationshipSelection(url.searchParams.get("id"), "prerequisite");
    if (selection === "new") {
        return relationshipDraft(
            {
                id: "__new__",
                subjectItemId: null,
                subjectKind: null,
                subjectCode: null,
                subjectName: null,
                subject: null,
                requiredItemId: null,
                requiredKind: null,
                requiredCode: null,
                requiredName: null,
                required: null,
                createdAt: null,
            },
            query,
        );
    }
    const subjectId = selection?.left ?? integer(url.searchParams.get("subjectItemId"), "subjectItemId");
    const requiredId = selection?.right ?? integer(url.searchParams.get("requiredItemId"), "requiredItemId");
    addExactFilter(params, "subject_item_id", subjectId);
    addExactFilter(params, "required_item_id", requiredId);
    if (!(await addSearchFilter(params, query.query, "subject_item_id", "required_item_id"))) {
        return emptyList(query);
    }
    const { rows, total } = await listRows(`catalog_requirements?${params}`);
    const items = await catalogItemsFor(rows, "subject_item_id", "required_item_id");
    const hydrated = rows.map((row) => requirementProjection(row, items));
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
        requirementProjection({ subject_item_id: subjectItemId, required_item_id: requiredItemId }, items),
    ) as JsonRecord;
}

export async function variantFeatureWithSelections(
    variantItemId: number,
    featureItemId: number,
    variantFeature: JsonRecord,
): Promise<JsonRecord> {
    const items = await catalogItemsFor(
        [{ variant_item_id: variantItemId, feature_item_id: featureItemId }],
        "variant_item_id",
        "feature_item_id",
    );
    const variant = items.get(variantItemId);
    const feature = items.get(featureItemId);
    if (!variant || !feature) {
        throw new HttpError(502, "variant feature items are incomplete");
    }
    return camelize({
        ...variantFeature,
        id: relationshipId(variantItemId, featureItemId),
        variantName: variant.name,
        variant: catalogItemSelection(variant),
        featureName: feature.name,
        feature: catalogItemSelection(feature),
    }) as JsonRecord;
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

function relationshipDraft(item: JsonRecord, query: ReturnType<typeof listQuery>): Response {
    return json({ items: [], item, total: 0, limit: query.limit, offset: query.offset });
}

function requirementProjection(requirement: JsonRecord, items: Map<number, JsonRecord>): JsonRecord {
    const subjectItemId = Number(requirement.subject_item_id);
    const requiredItemId = Number(requirement.required_item_id);
    return {
        ...catalogRequirementProjection(requirement, items),
        id: relationshipId(subjectItemId, requiredItemId),
        subject: catalogItemSelection(items.get(subjectItemId)),
        required: catalogItemSelection(items.get(requiredItemId)),
    };
}

function catalogItemSelection(item: JsonRecord | undefined): JsonRecord | null {
    if (!item) {
        return null;
    }
    return {
        id: item.id,
        kind: item.kind,
        code: item.code,
        name: item.name,
        lookup_subtitle: `${String(item.kind)} · ${String(item.code)}`,
    };
}

function relationshipId(left: number, right: number): string {
    return `${left}:${right}`;
}

function relationshipSelection(
    value: string | null,
    label: string,
): { left: number; right: number } | "new" | undefined {
    if (!value) {
        return undefined;
    }
    if (value === "__new__") {
        return "new";
    }
    const match = /^([1-9]\d*):([1-9]\d*)$/.exec(value);
    if (!match) {
        throw new HttpError(400, `${label} id must contain two positive integers`);
    }
    const left = Number(match[1]);
    const right = Number(match[2]);
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
        throw new HttpError(400, `${label} id must contain two positive integers`);
    }
    return { left, right };
}
