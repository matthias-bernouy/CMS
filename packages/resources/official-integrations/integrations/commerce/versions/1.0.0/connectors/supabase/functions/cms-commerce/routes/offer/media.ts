import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { corsHeaders, json } from "../../core/http.ts";
import { camelize, isRecord } from "../../core/records.ts";
import { one, rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { productMediaBucket } from "../catalog/media-constants.ts";
import { offerImagePath, readCommerceImage, readMediaIds, requiredQueryId } from "../catalog/media-request.ts";
import { deleteStorageImageBestEffort, downloadStorageImage, uploadStorageImage } from "../catalog/media-storage.ts";
import { requirePublicSeller } from "./public-seller.ts";

type OfferMediaScope = "public" | "admin" | "self";

export async function uploadOfferImage(request: Request, scope: OfferMediaScope): Promise<Response> {
    return attachUploadedImage(request, scope, null);
}

export async function replaceOfferImage(request: Request, scope: OfferMediaScope): Promise<Response> {
    return attachUploadedImage(request, scope, requiredQueryId(request, "mediaId"));
}

export async function removeOfferImage(request: Request, scope: OfferMediaScope): Promise<Response> {
    const result = await rpcRecord("remove_offer_media", {
        p_offer_id: requiredQueryId(request, "offerId"),
        p_media_id: requiredQueryId(request, "mediaId"),
        p_cms_user_id: scope === "self" ? cmsUserId(request) : null,
    });
    await removeReturnedObject(result, "storage_bucket", "storage_path");
    return resultResponse(result);
}

export async function reorderOfferImages(request: Request, scope: OfferMediaScope): Promise<Response> {
    const result = await rpcRecord("reorder_offer_media", {
        p_offer_id: requiredQueryId(request, "offerId"),
        p_media_ids: await readMediaIds(request),
        p_cms_user_id: scope === "self" ? cmsUserId(request) : null,
    });
    return resultResponse(result);
}

export async function getOfferImageFile(request: Request, scope: OfferMediaScope): Promise<Response> {
    const mediaId = requiredQueryId(request, "id", "mediaId");
    if (scope === "self") {
        await requireOwnedOfferMedia(request, mediaId);
    }
    if (scope === "public") {
        await requirePublicOfferMedia(mediaId);
    }
    const media = await one("media", { id: mediaId }, "id,storage_bucket,storage_path,mime_type");
    if (!media || media.storage_bucket !== productMediaBucket || typeof media.storage_path !== "string") {
        throw new HttpError(404, "offer image not found");
    }
    const stored = await downloadStorageImage(productMediaBucket, media.storage_path);
    const headers = new Headers(corsHeaders);
    copyHeader(stored, headers, "content-type", String(media.mime_type ?? "application/octet-stream"));
    copyHeader(stored, headers, "etag");
    copyHeader(stored, headers, "last-modified");
    headers.set("cache-control", scope === "public" ? "public, max-age=3600" : "private, max-age=3600");
    return new Response(stored.body, { status: 200, headers });
}

async function requirePublicOfferMedia(mediaId: number): Promise<void> {
    const link = await one("offer_media", { media_id: mediaId }, "offer_id");
    const offer = link ? await one("offers", { id: String(link.offer_id) }, "publication_status,seller_id") : null;
    if (!offer || offer.publication_status !== "active") {
        throw new HttpError(404, "offer image not found");
    }
    await requirePublicSeller(String(offer.seller_id));
}

async function attachUploadedImage(
    request: Request,
    scope: OfferMediaScope,
    replacedMediaId: number | null,
): Promise<Response> {
    const offerId = requiredQueryId(request, "offerId");
    const file = await readCommerceImage(request);
    const storagePath = offerImagePath(offerId, file);
    await uploadStorageImage(productMediaBucket, storagePath, file);
    let result: JsonRecord;
    try {
        result = await rpcRecord("attach_offer_media", {
            p_offer_id: offerId,
            p_storage_bucket: productMediaBucket,
            p_storage_path: storagePath,
            p_mime_type: file.type.toLowerCase(),
            p_file_size: file.size,
            p_original_filename: file.name || null,
            p_replace_media_id: replacedMediaId,
            p_cms_user_id: scope === "self" ? cmsUserId(request) : null,
        });
    } catch (error) {
        await deleteStorageImageBestEffort(productMediaBucket, storagePath);
        throw error;
    }
    await removeReturnedObject(result, "replaced_storage_bucket", "replaced_storage_path");
    return resultResponse(result);
}

async function requireOwnedOfferMedia(request: Request, mediaId: number): Promise<void> {
    const link = await one("offer_media", { media_id: mediaId }, "offer_id");
    const offer = link ? await one("offers", { id: String(link.offer_id) }, "seller_id") : null;
    const seller = offer ? await one("sellers", { id: String(offer.seller_id) }, "cms_user_id") : null;
    if (!seller || seller.cms_user_id !== cmsUserId(request)) {
        throw new HttpError(404, "offer image not found");
    }
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
