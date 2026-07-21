import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, integer, isRecord, readJsonObject, text } from "../../../core/records.ts";
import { listRows, rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";
import { getCategoryReadModel } from "./category-read-model.ts";
import { categoryFields } from "./category-fields.ts";

const select = "id,parent_id,slug,full_slug,label,description,status,position,metadata,version,created_at,updated_at";

export async function listCategories(request: Request, admin: boolean): Promise<Response> {
    const url = new URL(request.url);
    const params = paging(url);
    params.set("select", select);
    params.set("order", "position.asc,label.asc,id.asc");
    if (admin) {
        addEq(params, "status", url.searchParams.get("status"));
    } else {
        params.set("status", "eq.active");
    }
    const parent = url.searchParams.get("parentId");
    if (parent === "root") {
        params.set("parent_id", "is.null");
    } else {
        addEq(params, "parent_id", parent);
    }
    addSearch(params, url.searchParams.get("q"));
    const { rows, total } = await listRows(`categories?${params.toString()}`);
    return json({
        items: camelize(rows),
        total,
        limit: Number(params.get("limit")),
        offset: Number(params.get("offset")),
    });
}

export async function getCategory(request: Request, admin: boolean): Promise<Response> {
    const url = new URL(request.url);
    if (admin && url.searchParams.get("id") === "__new__") {
        return json({
            id: null,
            parentId: null,
            slug: "",
            fullSlug: "",
            label: "",
            description: "",
            status: "active",
            position: 0,
            metadata: {},
            categoryFields: [],
            version: 1,
        });
    }
    const id = optionalId(url.searchParams.get("id"));
    const fullSlug = text(url.searchParams.get("fullSlug")) ?? null;
    if (id === null && !fullSlug) {
        throw new HttpError(400, "id or fullSlug is required");
    }
    const model = await getCategoryReadModel(admin ? "admin" : "public", id, id === null ? fullSlug : null);
    if (!model) {
        throw new HttpError(404, "category not found");
    }
    return json({
        ...(camelize(model.category) as object),
        parent: model.parent ? camelize(model.parent) : null,
        categoryFields: camelize(model.categoryFields),
    });
}

export async function upsertCategory(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readJsonObject(request);
    const requestedCategoryId = optionalId(url.searchParams.get("id"));
    const result = await rpc("upsert_category", {
        p_category_id: requestedCategoryId,
        p_payload: body,
        p_expected_version: integer(body.expectedVersion, "expectedVersion", requestedCategoryId !== null),
    });
    if (!isRecord(result)) {
        throw new HttpError(502, "upsert_category returned an invalid response");
    }
    const categoryId = Number(result.id);
    let fields: unknown[] = [];
    if (Array.isArray(body.categoryFields)) {
        const synced = await rpc("sync_category_custom_fields", {
            p_category_id: categoryId,
            p_fields: normalizeCategoryFields(body.categoryFields),
        });
        fields = isRecord(synced) && Array.isArray(synced.fields) ? synced.fields : [];
    } else {
        fields = await categoryFields(categoryId);
    }
    return json({ ...(camelize(result) as object), categoryFields: camelize(fields) });
}

export async function deleteCategory(request: Request): Promise<Response> {
    const id = optionalId(new URL(request.url).searchParams.get("id"));
    if (id === null) {
        throw new HttpError(400, "id is required");
    }
    return json(camelize(await rpc("delete_category", { p_category_id: id })));
}

function normalizeCategoryFields(value: unknown[]): JsonRecord[] {
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new HttpError(422, `categoryFields.${index} must be an object`);
        }
        const fieldKey = text(entry.fieldKey);
        if (!fieldKey) {
            throw new HttpError(422, `categoryFields.${index}.fieldKey is required`);
        }
        return {
            fieldKey,
            required: booleanText(entry.required),
            filterable: booleanText(entry.filterable),
            position: integer(entry.position, `categoryFields.${index}.position`) ?? index,
        };
    });
}

function booleanText(value: unknown): boolean {
    return value === true || value === "true" || value === "1" || value === "yes";
}

export async function reorderCategories(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const ids = orderedIds(body.ids);
    return json(camelize(await rpc("reorder_categories", { p_ids: ids })));
}

function paging(url: URL): URLSearchParams {
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 100, 1), 200);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    return new URLSearchParams({ limit: String(limit), offset: String(offset) });
}

function addEq(params: URLSearchParams, column: string, value: string | null): void {
    if (value?.trim()) {
        params.set(column, `eq.${value.trim()}`);
    }
}

function addSearch(params: URLSearchParams, value: string | null): void {
    const query = value?.trim().replace(/[,*()]/g, " ");
    if (query) {
        params.set("or", `(label.ilike.*${query}*,slug.ilike.*${query}*,full_slug.ilike.*${query}*)`);
    }
}

function optionalId(value: string | null): number | null {
    if (!value || value === "__new__") {
        return null;
    }
    return integer(value, "id", true)!;
}

function orderedIds(value: unknown): number[] {
    if (!Array.isArray(value) || value.length > 200) {
        throw new HttpError(400, "category ids must be an array");
    }
    const ids = value.map((id, index) => integer(id, `ids.${index}`, true)!);
    if (new Set(ids).size !== ids.length) {
        throw new HttpError(400, "category ids must be unique");
    }
    return ids;
}
