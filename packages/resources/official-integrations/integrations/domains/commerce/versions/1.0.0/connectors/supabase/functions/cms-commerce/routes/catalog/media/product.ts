import { HttpError } from "../../../core/errors.ts";
import { corsHeaders, json } from "../../../core/http.ts";
import { camelize, isRecord } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";
import { productMediaBucket } from "./constants.ts";
import {
    productImagePath,
    readCommerceImage,
    readMediaIds,
    requiredQueryId,
    requireMediaUploadAuthorization,
} from "./request.ts";
import { deleteStorageImageBestEffort, downloadStorageImage, uploadStorageImageWithFailureCleanup } from "./storage.ts";

export async function uploadProductImage(request: Request): Promise<Response> {
    return attachUploadedImage(request, null);
}

export async function replaceProductImage(request: Request): Promise<Response> {
    return attachUploadedImage(request, requiredQueryId(request, "mediaId"));
}

export async function removeProductImage(request: Request): Promise<Response> {
    const result = await rpcRecord("remove_product_media", {
        p_product_id: requiredQueryId(request, "productId"),
        p_media_id: requiredQueryId(request, "mediaId"),
    });
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
    const context = await rpcRecord("get_product_media_download_context", {
        p_media_id: mediaId,
    });
    const media = context.state === "ok" && isRecord(context.media) ? context.media : null;
    if (!media || media.storage_bucket !== productMediaBucket || typeof media.storage_path !== "string") {
        throw new HttpError(404, "product image not found");
    }
    const stored = await downloadStorageImage(productMediaBucket, media.storage_path);
    const headers = new Headers(corsHeaders);
    copyHeader(stored, headers, "content-type", String(media.mime_type ?? "application/octet-stream"));
    copyHeader(stored, headers, "etag");
    copyHeader(stored, headers, "last-modified");
    headers.set("cache-control", "private, no-store");
    return new Response(stored.body, { status: 200, headers });
}

async function attachUploadedImage(request: Request, replacedMediaId: number | null): Promise<Response> {
    const productId = requiredQueryId(request, "productId");
    const authorization = await rpcRecord("authorize_product_media_upload", {
        p_product_id: productId,
        p_replace_media_id: replacedMediaId,
    });
    requireMediaUploadAuthorization(
        authorization,
        "product_id",
        productId,
        replacedMediaId,
        "authorize_product_media_upload",
    );
    const image = await readCommerceImage(request);
    const storagePath = productImagePath(productId, image);
    await uploadStorageImageWithFailureCleanup(productMediaBucket, storagePath, image.file);
    let result: JsonRecord;
    try {
        result = await rpcRecord("attach_product_media_v2", {
            p_product_id: productId,
            p_storage_bucket: productMediaBucket,
            p_storage_path: storagePath,
            p_mime_type: image.mimeType,
            p_file_size: image.file.size,
            p_original_filename: image.file.name || null,
            p_width: image.width,
            p_height: image.height,
            p_replace_media_id: replacedMediaId,
        });
    } catch (error) {
        if (isDefinitiveAttachRejection(error)) {
            await deleteStorageImageBestEffort(productMediaBucket, storagePath);
        }
        throw error;
    }
    return resultResponse(result);
}

function isDefinitiveAttachRejection(error: unknown): error is HttpError {
    return error instanceof HttpError && error.status >= 400 && error.status < 500;
}

async function rpcRecord(name: string, body: JsonRecord): Promise<JsonRecord> {
    const result = await rpc(name, body);
    if (!isRecord(result)) {
        throw new HttpError(502, `${name} returned an invalid response`);
    }
    return result;
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
