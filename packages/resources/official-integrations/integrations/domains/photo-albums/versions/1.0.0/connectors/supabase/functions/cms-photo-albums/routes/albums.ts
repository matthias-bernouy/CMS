import { json, methodNotAllowed } from "../core/http.ts";
import { HttpError } from "../core/errors.ts";
import { camelize, optionalInteger, optionalText, readJsonObject, requiredId, requiredText } from "../core/records.ts";
import { rpc } from "../core/rest.ts";

export async function handleAlbumRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/public/albums") {
        return request.method === "GET" ? await listPublicAlbums(request) : methodNotAllowed("GET");
    }
    if (route === "/public/album") {
        return request.method === "GET" ? await getPublicAlbum(request) : methodNotAllowed("GET");
    }
    if (route === "/albums") {
        return request.method === "GET" ? await listManagedAlbums(request) : methodNotAllowed("GET");
    }
    if (route === "/album") {
        if (request.method === "GET") {
            const id = new URL(request.url).searchParams.get("id");
            const albumId = optionalQueryId(id, "id");
            const album = await rpc("get_managed_album", { p_album_id: albumId });
            if (albumId && album === null) {
                throw new HttpError(404, "album not found");
            }
            return json(camelize(album));
        }
        return request.method === "POST" ? await upsertAlbum(request) : methodNotAllowed("GET", "POST");
    }
    if (route === "/album/archive") {
        return request.method === "POST" ? await archiveAlbum(request) : methodNotAllowed("POST");
    }
    if (route === "/albums/reorder") {
        return request.method === "POST" ? await reorderAlbums(request) : methodNotAllowed("POST");
    }
    return null;
}

async function listPublicAlbums(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    return rpcResponse("list_public_albums", {
        p_q: optionalText(params.get("q"), "q"),
        p_category_slug: optionalText(params.get("category"), "category"),
        p_limit: nullablePageValue(params.get("limit"), "limit"),
        p_offset: pageValue(params.get("offset"), "offset", 0),
    });
}

async function getPublicAlbum(request: Request): Promise<Response> {
    const slug = optionalText(new URL(request.url).searchParams.get("slug"), "slug");
    if (!slug) {
        throw new HttpError(400, "slug is required");
    }
    const album = await rpc("get_public_album", { p_slug: slug });
    if (album === null) {
        throw new HttpError(404, "album not found");
    }
    return json(camelize(album));
}

async function listManagedAlbums(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    return rpcResponse("list_managed_albums", {
        p_q: optionalText(params.get("q"), "q"),
        p_status: optionalText(params.get("status"), "status"),
        p_category_id: optionalQueryId(params.get("categoryId"), "categoryId"),
        p_limit: pageValue(params.get("limit"), "limit", 50),
        p_offset: pageValue(params.get("offset"), "offset", 0),
    });
}

async function upsertAlbum(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    return rpcResponse("upsert_album", {
        p_album_id: optionalBodyId(body.id, "id"),
        p_title: requiredText(body.title, "title"),
        p_slug: requiredText(body.slug, "slug"),
        p_description: optionalText(body.description, "description"),
        p_category_id: optionalBodyId(body.categoryId, "categoryId"),
        p_status: optionalText(body.status, "status") ?? "draft",
        p_position: optionalInteger(body.position, "position", 0),
        p_expected_version: optionalVersion(body.version),
    });
}

async function archiveAlbum(request: Request): Promise<Response> {
    const body = await readJsonObject(request).catch(() => ({}));
    return rpcResponse("archive_album", {
        p_album_id: requiredId(request, "id"),
        p_expected_version: optionalVersion(body.version),
    });
}

async function reorderAlbums(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    if (!Array.isArray(body.albumIds)) {
        throw new HttpError(400, "albumIds must be an array");
    }
    return rpcResponse("reorder_albums", {
        p_album_ids: body.albumIds.map((value, index) => {
            const id = optionalBodyId(value, `albumIds[${index}]`);
            if (!id) {
                throw new HttpError(400, `albumIds[${index}] must be a positive integer`);
            }
            return id;
        }),
    });
}

async function rpcResponse(name: string, body: Record<string, unknown>): Promise<Response> {
    return json(camelize(await rpc(name, body)));
}

function pageValue(value: unknown, name: string, fallback: number): number {
    const result = optionalInteger(value, name, fallback);
    if (result < 0) {
        throw new HttpError(400, `${name} must not be negative`);
    }
    return result;
}

function nullablePageValue(value: string | null, name: string): number | null {
    return value === null || value === "" ? null : pageValue(value, name, 0);
}

function optionalQueryId(value: string | null, name: string): number | null {
    return optionalBodyId(value, name);
}

function optionalBodyId(value: unknown, name: string): number | null {
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
