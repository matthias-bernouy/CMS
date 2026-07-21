import { HttpError } from "../../core/errors.ts";
import { corsHeaders, json } from "../../core/http.ts";
import { camelize, isRecord } from "../../core/records.ts";
import { one, rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { productMediaBucket } from "./media-constants.ts";
import { productImagePath, readCommerceImage, readMediaIds, requiredQueryId } from "./media-request.ts";
import { deleteStorageImageBestEffort, downloadStorageImage, uploadStorageImage } from "./media-storage.ts";

export async function uploadProductImage(request: Request): Promise<Response> {
    return await attachUploadedImage(request, null);
}

export async function replaceProductImage(request: Request): Promise<Response> {
    return await attachUploadedImage(request, requiredQueryId(request, "mediaId"));
}

export async function removeProductImage(request: Request): Promise<Response> {
    const result = await rpcRecord("remove_product_media", {
        p_product_id: requiredQueryId(request, "productId"),
        p_media_id: requiredQueryId(request, "mediaId"),
    });
    await removeReturnedObject(result, "storage_bucket", "storage_path");
    return resultResponse(result);
}

export async function reorderProductImages(request: Request): Promise<Response> {
    const result = await rpcRecord("reorder_product_media", {
        p_product_id: requiredQueryId(request, "productId"),
        p_media_ids: await readMediaIds(request),
    });
    return resultResponse(result);
}

export async function getProductImageFile(request: Request): Promise<Response> {
    const mediaId = requiredQueryId(request, "id", "mediaId");
    const media = await one("media", { id: mediaId }, "id,storage_bucket,storage_path,mime_type");
    if (!media || media.storage_bucket !== productMediaBucket || typeof media.storage_path !== "string") {
        throw new HttpError(404, "product image not found");
    }
    const stored = await downloadStorageImage(productMediaBucket, media.storage_path);
    const headers = new Headers(corsHeaders);
    copyHeader(stored, headers, "content-type", String(media.mime_type ?? "application/octet-stream"));
    copyHeader(stored, headers, "etag");
    copyHeader(stored, headers, "last-modified");
    headers.set("cache-control", "public, max-age=3600");
    return new Response(stored.body, { status: 200, headers });
}

async function attachUploadedImage(request: Request, replacedMediaId: number | null): Promise<Response> {
    const productId = requiredQueryId(request, "productId");
    const file = await readCommerceImage(request);
    const storagePath = productImagePath(productId, file);
    await uploadStorageImage(productMediaBucket, storagePath, file);
    let result: JsonRecord;
    try {
        result = await rpcRecord("attach_product_media", {
            p_product_id: productId,
            p_storage_bucket: productMediaBucket,
            p_storage_path: storagePath,
            p_mime_type: file.type.toLowerCase(),
            p_file_size: file.size,
            p_original_filename: file.name || null,
            p_replace_media_id: replacedMediaId,
        });
    } catch (error) {
        await deleteStorageImageBestEffort(productMediaBucket, storagePath);
        throw error;
    }
    await removeReturnedObject(result, "replaced_storage_bucket", "replaced_storage_path");
    return resultResponse(result);
}

async function rpcRecord(name: string, body: JsonRecord): Promise<JsonRecord> {
    const result = await rpc(name, body);
    if (!isRecord(result)) {
        throw new HttpError(502, `${name} returned an invalid response`);
    }
    return result;
}

async function removeReturnedObject(result: JsonRecord, bucketKey: string, pathKey: string): Promise<void> {
    const bucket = result[bucketKey] ?? result[camelKey(bucketKey)];
    const path = result[pathKey] ?? result[camelKey(pathKey)];
    if (bucket === productMediaBucket && typeof path === "string" && path) {
        await deleteStorageImageBestEffort(bucket, path);
    }
}

function resultResponse(result: JsonRecord): Response {
    return json({ ok: true, ...(camelize(result) as JsonRecord) });
}

function copyHeader(source: Response, target: Headers, name: string, fallback?: string): void {
    const value = source.headers.get(name) ?? fallback;
    if (value) {
        target.set(name, value);
    }
}

function camelKey(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
