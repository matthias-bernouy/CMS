import { HttpError } from "../core/errors.ts";
import { requireCmsRequest, requireCmsWriteRequest } from "../core/auth.ts";
import { corsHeaders, json, withMethod } from "../core/http.ts";
import { requiredPositiveInteger } from "../core/query.ts";
import { readJsonObject } from "../core/records.ts";
import { getOne, rest, restError, restJson } from "../core/rest.ts";
import { mediaBucket } from "../storage/constants.ts";
import { storageError, storageObject } from "../storage/client.ts";
import { mediaObjectPath, readUploadFile } from "../storage/files.ts";
import { insertRow, updateRow } from "../writes/rows.ts";

type MediaOwnerLink = {
    table: "product_media" | "variant_media";
    ownerKey: "product_id" | "variant_id";
    ownerParam: "productId" | "variantId";
};

export async function mediaUpload(request: Request, owner?: MediaOwnerLink): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const url = new URL(request.url);
        const row = await createMedia(await readUploadFile(request));
        if (owner) await linkUploadedMedia(owner, url, row.id);
        return json({
            ok: true,
            id: String(row.id),
            mediaId: String(row.id),
            storageBucket: row.storage_bucket,
            storagePath: row.storage_path,
            mimeType: row.mime_type,
            fileSize: row.file_size,
            originalFilename: row.original_filename,
        });
    });
}

export async function mediaReplace(request: Request, owner: MediaOwnerLink): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const url = new URL(request.url);
        const ownerId = requiredPositiveInteger(url.searchParams.get(owner.ownerParam), owner.ownerParam);
        const previousMediaId = requiredPositiveInteger(url.searchParams.get("mediaId"), "mediaId");
        const previous = await getOne(owner.table, { [owner.ownerKey]: ownerId, media_id: previousMediaId }, "id,sort_order,is_main");
        if (!previous) throw new HttpError(404, "media link not found");
        const media = await createMedia(await readUploadFile(request));
        await updateRow(owner.table, previous.id, { media_id: media.id });
        return json({ ok: true, mediaId: String(media.id), replacedMediaId: String(previousMediaId) });
    });
}

export async function mediaRemove(request: Request, owner: MediaOwnerLink): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "DELETE", async () => {
        const url = new URL(request.url);
        const ownerId = requiredPositiveInteger(url.searchParams.get(owner.ownerParam), owner.ownerParam);
        const mediaId = requiredPositiveInteger(url.searchParams.get("mediaId"), "mediaId");
        const current = await getOne(owner.table, { [owner.ownerKey]: ownerId, media_id: mediaId }, "id,is_main");
        if (current) await deleteLink(owner.table, current.id);
        if (current?.is_main === true) await promoteFirstMedia(owner, ownerId);
        return json({ ok: true, mediaId: String(mediaId) });
    });
}

export async function mediaReorder(request: Request, owner: MediaOwnerLink): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const ownerId = requiredPositiveInteger(new URL(request.url).searchParams.get(owner.ownerParam), owner.ownerParam);
        const body = await readJsonObject(request);
        const ids = Array.isArray(body.mediaIds) ? body.mediaIds.map(item => String(item)).filter(Boolean) : [];
        for (const [index, mediaId] of ids.entries()) {
            const link = await getOne(owner.table, { [owner.ownerKey]: ownerId, media_id: mediaId }, "id");
            if (link) await updateRow(owner.table, link.id, { sort_order: index, is_main: index === 0 });
        }
        return json({ ok: true, mediaIds: ids });
    });
}

async function linkUploadedMedia(owner: MediaOwnerLink, url: URL, mediaId: unknown): Promise<void> {
    const ownerId = url.searchParams.get(owner.ownerParam);
    if (!ownerId) return;
    const currentMain = await getOne(owner.table, { [owner.ownerKey]: ownerId, is_main: true }, "id");
    await insertRow(owner.table, {
        [owner.ownerKey]: ownerId,
        media_id: mediaId,
        sort_order: await nextMediaSortOrder(owner, ownerId),
        is_main: !currentMain,
    });
}

async function nextMediaSortOrder(owner: MediaOwnerLink, ownerId: string): Promise<number> {
    const rows = await restJson<Record<string, unknown>[]>(
        `${owner.table}?${owner.ownerKey}=eq.${encodeURIComponent(ownerId)}&select=sort_order&order=sort_order.desc&limit=1`,
        { method: "GET" },
    );
    const current = Number(rows[0]?.sort_order ?? -1);
    return Number.isInteger(current) && current >= 0 ? current + 1 : 0;
}

export async function mediaFile(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return await withMethod(request, "GET", async () => {
        const id = requiredPositiveInteger(new URL(request.url).searchParams.get("id"), "id");
        const row = await getOne("media", { id }, "id,storage_bucket,storage_path,mime_type");
        if (!row?.storage_path || row.storage_bucket !== mediaBucket) throw new HttpError(404, "media file not found");

        const response = await storageObject(String(row.storage_path), { method: "GET" });
        if (response.status === 404) throw new HttpError(404, "media file not found");
        if (!response.ok) throw await storageError(response);

        const headers = new Headers(corsHeaders);
        copyResponseHeader(response, headers, "content-type", String(row.mime_type ?? "application/octet-stream"));
        headers.set("cache-control", "public, max-age=3600");
        copyResponseHeader(response, headers, "etag");
        copyResponseHeader(response, headers, "last-modified");
        return new Response(response.body, { status: 200, headers });
    });
}

async function createMedia(file: File): Promise<Record<string, unknown>> {
    const contentType = file.type.toLowerCase();
    const storagePath = mediaObjectPath(file);
    const response = await storageObject(storagePath, {
        method: "POST",
        headers: { "cache-control": "31536000", "content-type": contentType },
        body: file,
    });
    if (!response.ok) throw await storageError(response);
    return await insertRow("media", {
        storage_bucket: mediaBucket,
        storage_path: storagePath,
        mime_type: contentType,
        file_size: file.size,
        original_filename: file.name || null,
    });
}

async function deleteLink(table: MediaOwnerLink["table"], id: unknown): Promise<void> {
    const response = await rest(`${table}?id=eq.${encodeURIComponent(String(id))}`, {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
    });
    if (!response.ok) throw await restError(response);
}

async function promoteFirstMedia(owner: MediaOwnerLink, ownerId: unknown): Promise<void> {
    const rows = await restJson<Record<string, unknown>[]>(
        `${owner.table}?${owner.ownerKey}=eq.${encodeURIComponent(String(ownerId))}&select=id&order=sort_order.asc&limit=1`,
        { method: "GET" },
    );
    if (rows[0]) await updateRow(owner.table, rows[0].id, { is_main: true });
}

function copyResponseHeader(response: Response, headers: Headers, name: string, fallback?: string): void {
    const value = response.headers.get(name) ?? fallback;
    if (value) headers.set(name, value);
}
