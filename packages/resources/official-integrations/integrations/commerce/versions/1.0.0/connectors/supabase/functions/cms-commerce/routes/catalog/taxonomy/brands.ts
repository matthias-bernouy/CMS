import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, integer, isRecord, readJsonObject, text } from "../../../core/records.ts";
import { listRows, one, rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";

const select = "id,slug,name,description,status,metadata,version,created_at,updated_at";

export async function listBrands(request: Request, admin: boolean): Promise<Response> {
    const url = new URL(request.url);
    const params = paging(url);
    params.set("select", select);
    params.set("order", "position.asc,name.asc,id.asc");
    if (admin) {
        addEq(params, "status", url.searchParams.get("status"));
    } else {
        params.set("status", "eq.active");
    }
    addSearch(params, url.searchParams.get("q"));
    const { rows, total } = await listRows(`brands?${params.toString()}`);
    return json({
        items: camelize(rows),
        total,
        limit: Number(params.get("limit")),
        offset: Number(params.get("offset")),
    });
}

export async function getBrand(request: Request, admin: boolean): Promise<Response> {
    const url = new URL(request.url);
    if (admin && url.searchParams.get("id") === "__new__") {
        return json({ id: null, slug: "", name: "", description: "", status: "active", metadata: {}, version: 1 });
    }
    const id = optionalId(url.searchParams.get("id"));
    const slug = text(url.searchParams.get("slug"));
    if (id === null && !slug) {
        throw new HttpError(400, "id or slug is required");
    }
    const row = id !== null ? await one("brands", { id }, select) : await one("brands", { slug: slug! }, select);
    if (!row || (!admin && row.status !== "active")) {
        throw new HttpError(404, "brand not found");
    }
    return json(camelize(row));
}

export async function upsertBrand(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readJsonObject(request);
    const brandId = optionalId(url.searchParams.get("id"));
    const result = await rpc("upsert_brand", {
        p_brand_id: brandId,
        p_payload: body,
        p_expected_version: integer(body.expectedVersion, "expectedVersion", brandId !== null),
    });
    if (!isRecord(result)) {
        throw new HttpError(502, "upsert_brand returned an invalid response");
    }
    return json(camelize(result));
}

export async function deleteBrand(request: Request): Promise<Response> {
    const id = optionalId(new URL(request.url).searchParams.get("id"));
    if (id === null) {
        throw new HttpError(400, "id is required");
    }
    return json(camelize(await rpc("delete_brand", { p_brand_id: id })));
}

export async function reorderBrands(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const ids = orderedIds(body.ids, "brand");
    return json(camelize(await rpc("reorder_brands", { p_ids: ids })));
}

function paging(url: URL): URLSearchParams {
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
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
        params.set("or", `(name.ilike.*${query}*,slug.ilike.*${query}*)`);
    }
}

function optionalId(value: string | null): number | null {
    if (!value || value === "__new__") {
        return null;
    }
    return integer(value, "id", true)!;
}

function orderedIds(value: unknown, entity: string): number[] {
    if (!Array.isArray(value) || value.length > 200) {
        throw new HttpError(400, `${entity} ids must be an array`);
    }
    const ids = value.map((id, index) => integer(id, `ids.${index}`, true)!);
    if (new Set(ids).size !== ids.length) {
        throw new HttpError(400, `${entity} ids must be unique`);
    }
    return ids;
}
