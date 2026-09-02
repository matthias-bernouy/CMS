import { json, methodNotAllowed } from "../core/http.ts";
import { HttpError } from "../core/errors.ts";
import { camelize, optionalInteger, optionalText, readJsonObject, requiredId, requiredText } from "../core/records.ts";
import { rpc } from "../core/rest.ts";

export async function handleCategoryRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/public/categories") {
        return request.method === "GET" ? rpcResponse("list_public_categories") : methodNotAllowed("GET");
    }
    if (route === "/categories") {
        if (request.method !== "GET") {
            return methodNotAllowed("GET");
        }
        const params = new URL(request.url).searchParams;
        return rpcResponse("list_managed_categories", {
            p_q: optionalText(params.get("q"), "q"),
            p_limit: optionalInteger(params.get("limit"), "limit", 100),
            p_offset: optionalInteger(params.get("offset"), "offset", 0),
        });
    }
    if (route === "/category") {
        if (request.method === "GET") {
            const id = new URL(request.url).searchParams.get("id");
            const categoryId = positiveIdOrNull(id, "id");
            const category = await rpc("get_managed_category", { p_category_id: categoryId });
            if (categoryId && category === null) {
                throw new HttpError(404, "category not found");
            }
            return json(camelize(category));
        }
        if (request.method === "POST") {
            return await upsertCategory(request);
        }
        if (request.method === "DELETE") {
            return await deleteCategory(request);
        }
        return methodNotAllowed("GET", "POST", "DELETE");
    }
    if (route === "/categories/reorder") {
        return request.method === "POST" ? await reorderCategories(request) : methodNotAllowed("POST");
    }
    return null;
}

async function upsertCategory(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    return rpcResponse("upsert_category", {
        p_category_id: positiveIdOrNull(body.id, "id"),
        p_name: requiredText(body.name, "name"),
        p_slug: requiredText(body.slug, "slug"),
        p_description: optionalText(body.description, "description"),
        p_position: optionalInteger(body.position, "position", 0),
        p_expected_version: optionalVersion(body.version),
    });
}

async function deleteCategory(request: Request): Promise<Response> {
    const body = await readJsonObject(request).catch(() => ({}));
    return rpcResponse("delete_category", {
        p_category_id: requiredId(request, "id"),
        p_expected_version: optionalVersion(body.version),
    });
}

async function reorderCategories(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    return rpcResponse("reorder_categories", {
        p_category_ids: positiveIds(body.categoryIds, "categoryIds"),
    });
}

async function rpcResponse(name: string, body: Record<string, unknown> = {}): Promise<Response> {
    return json(camelize(await rpc(name, body)));
}

function positiveIds(value: unknown, name: string): number[] {
    if (!Array.isArray(value)) {
        throw new HttpError(400, `${name} must be an array`);
    }
    return value.map((item, index) => {
        const id = positiveIdOrNull(item, `${name}[${index}]`);
        if (!id) {
            throw new HttpError(400, `${name}[${index}] must be a positive integer`);
        }
        return id;
    });
}

function positiveIdOrNull(value: unknown, name: string): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return id;
}

function optionalVersion(value: unknown): number | null {
    return value === undefined || value === null ? null : optionalInteger(value, "version", 0);
}
