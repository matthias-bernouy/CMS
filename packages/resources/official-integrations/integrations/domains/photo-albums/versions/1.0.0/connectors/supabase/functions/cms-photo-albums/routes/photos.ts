import { HttpError } from "../core/errors.ts";
import { corsHeaders, json, methodNotAllowed } from "../core/http.ts";
import { camelize, isRecord, optionalText, readJsonObject, requiredId, requiredInteger } from "../core/records.ts";
import { rpc, rpcRecord } from "../core/rest.ts";
import { photoBucket } from "../media/constants.ts";
import { photoPath, photoUploadIds, readPhoto, readPhotoIds } from "../media/request.ts";
import { deletePhotoBestEffort, downloadPhoto, ensurePhotoBucket, uploadPhoto } from "../media/storage.ts";

export async function handlePhotoRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/public/photo" || route === "/photo") {
        if (request.method !== "GET") {
            return methodNotAllowed("GET");
        }
        return await getPhoto(request, route === "/public/photo");
    }
    if (route === "/photos/upload" || route === "/photos/replace") {
        if (request.method !== "POST") {
            return methodNotAllowed("POST");
        }
        return await attachPhoto(request, route === "/photos/replace");
    }
    if (route === "/photos/remove") {
        return request.method === "POST" ? await removePhoto(request) : methodNotAllowed("POST");
    }
    if (route === "/photos/reorder") {
        return request.method === "POST" ? await reorderPhotos(request) : methodNotAllowed("POST");
    }
    if (route === "/photo/metadata") {
        if (request.method === "GET") {
            const photo = await rpc("get_managed_photo", { p_photo_id: requiredId(request, "id") });
            if (photo === null) {
                throw new HttpError(404, "photo not found");
            }
            return json(camelize(photo));
        }
        return request.method === "POST" ? await updateMetadata(request) : methodNotAllowed("GET", "POST");
    }
    return null;
}

async function attachPhoto(request: Request, replacing: boolean): Promise<Response> {
    const ids = photoUploadIds(request);
    if (replacing && !ids.replacePhotoId) {
        throw new HttpError(400, "photoId is required");
    }
    if (!replacing && ids.replacePhotoId) {
        throw new HttpError(400, "photoId is not allowed for upload");
    }
    const authorized = await rpcRecord("authorize_photo_upload", {
        p_album_id: ids.albumId,
        p_replace_photo_id: ids.replacePhotoId,
    });
    if (authorized.state === "not_found") {
        throw new HttpError(404, "album or replacement photo not found");
    }
    if (authorized.state === "limit_reached") {
        throw new HttpError(409, "album photo limit reached");
    }
    if (
        authorized.state !== "authorized" ||
        authorized.album_id !== ids.albumId ||
        authorized.replace_photo_id !== ids.replacePhotoId
    ) {
        throw new HttpError(502, "authorize_photo_upload returned an invalid response");
    }

    const image = await readPhoto(request);
    const path = photoPath(ids.albumId, image);
    await ensurePhotoBucket();
    try {
        await uploadPhoto(path, image.file);
    } catch (error) {
        await deletePhotoBestEffort(path);
        throw error;
    }

    let result: unknown;
    try {
        const params = new URL(request.url).searchParams;
        result = await rpc("attach_album_photo", {
            p_album_id: ids.albumId,
            p_storage_bucket: photoBucket,
            p_storage_path: path,
            p_mime_type: image.mimeType,
            p_file_size: image.file.size,
            p_width: image.width,
            p_height: image.height,
            p_original_filename: image.file.name || null,
            p_alt: optionalText(params.get("alt"), "alt"),
            p_caption: optionalText(params.get("caption"), "caption"),
            p_taken_at: optionalText(params.get("takenAt"), "takenAt"),
            p_replace_photo_id: ids.replacePhotoId,
        });
    } catch (error) {
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
            await deletePhotoBestEffort(path);
        }
        throw error;
    }
    return json(camelize(result));
}

async function getPhoto(request: Request, publiclyVisible: boolean): Promise<Response> {
    const photoId = requiredId(request, "id");
    const functionName = publiclyVisible ? "get_public_photo_context" : "get_managed_photo_context";
    const context = await rpcRecord(functionName, { p_photo_id: photoId });
    const photo = context.state === "ok" && isRecord(context.photo) ? context.photo : null;
    if (!photo || photo.storage_bucket !== photoBucket || typeof photo.storage_path !== "string") {
        throw new HttpError(404, "photo not found");
    }
    const stored = await downloadPhoto(photo.storage_path);
    const headers = new Headers(corsHeaders);
    copyHeader(stored, headers, "content-type", stringOrNull(photo.mime_type) ?? "application/octet-stream");
    copyHeader(stored, headers, "etag");
    copyHeader(stored, headers, "last-modified");
    headers.set("cache-control", publiclyVisible ? "private, max-age=60" : "private, no-store");
    return new Response(stored.body, { status: 200, headers });
}

async function removePhoto(request: Request): Promise<Response> {
    return json(
        camelize(
            await rpc("detach_album_photo", {
                p_album_id: requiredId(request, "albumId"),
                p_photo_id: requiredId(request, "photoId"),
            }),
        ),
    );
}

async function reorderPhotos(request: Request): Promise<Response> {
    return json(
        camelize(
            await rpc("reorder_album_photos", {
                p_album_id: requiredId(request, "albumId"),
                p_photo_ids: await readPhotoIds(request),
            }),
        ),
    );
}

async function updateMetadata(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    return json(
        camelize(
            await rpc("update_album_photo", {
                p_album_id: requiredId(request, "albumId"),
                p_photo_id: requiredId(request, "id"),
                p_alt: optionalText(body.alt, "alt"),
                p_caption: optionalText(body.caption, "caption"),
                p_taken_at: optionalText(body.takenAt, "takenAt"),
                p_expected_version: requiredInteger(body.version, "version"),
            }),
        ),
    );
}

function copyHeader(source: Response, target: Headers, name: string, fallback?: string): void {
    const value = source.headers.get(name) ?? fallback;
    if (value) {
        target.set(name, value);
    }
}

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}
