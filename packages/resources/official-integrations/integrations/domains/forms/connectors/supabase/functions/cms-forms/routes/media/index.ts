import { cmsUserId, requireCmsAdmin } from "../../auth.ts";
import { builderReference } from "../../builder/references.ts";
import { boundedInteger, corsHeaders, HttpError, json, methodNotAllowed, queryText } from "../../http.ts";
import { rpcRecord } from "../../rest.ts";
import { formsMediaBucket } from "./constants.ts";
import { formImagePath, readFormImage } from "./request.ts";
import { deleteStorageImageBestEffort, downloadStorageImage, uploadStorageImage } from "./storage.ts";

export async function handleMediaRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/admin/form/image") {
        const actor = requireCmsAdmin(request);
        return request.method === "POST" ? await uploadImage(request, actor) : await managedImage(request);
    }
    if (route === "/public/form/image" || route === "/authenticated/form/image") {
        if (request.method !== "GET") {
            return methodNotAllowed("GET");
        }
        const actor = route.startsWith("/authenticated/") ? cmsUserId(request) : null;
        return await publishedImage(request, actor);
    }
    return null;
}

async function uploadImage(request: Request, actor: string): Promise<Response> {
    const reference = builderReference(queryText(new URL(request.url), "ref", true));
    const image = await readFormImage(request);
    const path = formImagePath(reference.formKey, image);
    await uploadStorageImage(formsMediaBucket, path, image.file);
    try {
        const media = await rpcRecord("create_media", {
            p_form_key: reference.formKey,
            p_storage_bucket: formsMediaBucket,
            p_storage_path: path,
            p_mime_type: image.mimeType,
            p_file_size: image.file.size,
            p_width: image.width,
            p_height: image.height,
            p_original_filename: image.file.name,
            p_actor_id: actor,
        });
        return json({ ok: true, ...media });
    } catch (error) {
        await deleteStorageImageBestEffort(formsMediaBucket, path);
        throw error;
    }
}

async function managedImage(request: Request): Promise<Response> {
    if (request.method !== "GET") {
        return methodNotAllowed("GET", "POST");
    }
    const mediaId = positiveQueryInteger(request, "id");
    return await streamImage(await rpcRecord("get_managed_media_context", { p_media_id: mediaId }));
}

async function publishedImage(request: Request, actor: string | null): Promise<Response> {
    const url = new URL(request.url);
    return await streamImage(
        await rpcRecord("get_published_media_context", {
            p_form_key: queryText(url, "key", true),
            p_version: boundedInteger(url.searchParams.get("version"), "version", 0, 1, 2_147_483_647),
            p_media_id: positiveQueryInteger(request, "id"),
            p_actor_id: actor,
        }),
    );
}

async function streamImage(context: Record<string, unknown>): Promise<Response> {
    const bucket = contextText(context, "storageBucket");
    const path = contextText(context, "storagePath");
    const mimeType = contextText(context, "mimeType");
    const stored = await downloadStorageImage(bucket, path);
    const headers = new Headers(corsHeaders);
    headers.set("cache-control", "private, no-store");
    headers.set("content-security-policy", "default-src 'none'");
    headers.set("content-type", mimeType);
    headers.set("x-content-type-options", "nosniff");
    const length = stored.headers.get("content-length");
    if (length) {
        headers.set("content-length", length);
    }
    return new Response(stored.body, { status: 200, headers });
}

function positiveQueryInteger(request: Request, name: string): number {
    const value = boundedInteger(new URL(request.url).searchParams.get(name), name, 0, 1, Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(value)) {
        throw new HttpError(422, `${name} must be a positive integer`);
    }
    return value;
}

function contextText(context: Record<string, unknown>, name: string): string {
    const value = context[name];
    if (typeof value !== "string" || !value || value.length > 2048) {
        throw new HttpError(502, "media context is invalid");
    }
    return value;
}
