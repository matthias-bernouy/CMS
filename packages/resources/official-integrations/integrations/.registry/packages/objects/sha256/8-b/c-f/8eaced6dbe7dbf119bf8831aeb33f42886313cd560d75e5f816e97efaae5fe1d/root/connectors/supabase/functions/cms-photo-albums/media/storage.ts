import { requiredEnv, serviceRoleKey } from "../core/env.ts";
import { HttpError } from "../core/errors.ts";
import { isRecord } from "../core/records.ts";
import { maxPhotoBytes, photoBucket } from "./constants.ts";

export async function ensurePhotoBucket(): Promise<void> {
    const existing = await bucketStorage(`/bucket/${encodeURIComponent(photoBucket)}`, { method: "GET" });
    if (existing.ok) {
        const bucket = await existing.json().catch(() => null);
        if (isRecord(bucket) && bucket.public === false && bucket.file_size_limit === maxPhotoBytes) {
            return;
        }
        const updated = await bucketStorage(`/bucket/${encodeURIComponent(photoBucket)}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(bucketConfiguration()),
        });
        if (!updated.ok) {
            throw await storageError(updated);
        }
        return;
    }
    if (!(await isMissingBucket(existing))) {
        throw await storageError(existing);
    }
    const created = await bucketStorage("/bucket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: photoBucket, name: photoBucket, ...bucketConfiguration() }),
    });
    if (!created.ok && created.status !== 409) {
        throw await storageError(created);
    }
}

const bucketRetryDelays = [50, 100, 250, 500, 1_000] as const;

async function bucketStorage(path: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            const response = await storage(path, init);
            if (response.status < 500 || attempt === bucketRetryDelays.length) {
                return response;
            }
            await response.body?.cancel();
        } catch (error) {
            if (!(error instanceof TypeError) || attempt === bucketRetryDelays.length) {
                throw error;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, bucketRetryDelays[attempt]));
    }
}

async function isMissingBucket(response: Response): Promise<boolean> {
    if (response.status === 404) {
        return true;
    }
    if (response.status !== 400) {
        return false;
    }
    const body = await response
        .clone()
        .json()
        .catch(() => null);
    return (
        isRecord(body) &&
        (body.error === "Bucket not found" ||
            body.message === "Bucket not found" ||
            body.statusCode === "404" ||
            body.statusCode === 404)
    );
}

function bucketConfiguration(): Record<string, unknown> {
    return {
        public: false,
        file_size_limit: maxPhotoBytes,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
    };
}

export async function uploadPhoto(path: string, file: File): Promise<void> {
    const response = await storage(objectPath(path), {
        method: "POST",
        headers: {
            "cache-control": "31536000",
            "content-type": file.type,
            "x-upsert": "false",
        },
        body: file,
    });
    if (!response.ok) {
        throw await storageError(response);
    }
}

export async function downloadPhoto(path: string): Promise<Response> {
    const response = await storage(objectPath(path), { method: "GET" });
    if (response.status === 404) {
        throw new HttpError(404, "photo not found");
    }
    if (!response.ok) {
        throw await storageError(response);
    }
    return response;
}

export async function deletePhotoBestEffort(path: string): Promise<void> {
    try {
        const response = await storage(objectPath(path), { method: "DELETE" });
        if (!response.ok && response.status !== 404) {
            console.warn(`Unable to remove unattached photo (${response.status})`);
        }
    } catch (error) {
        console.warn("Unable to remove unattached photo", error);
    }
}

function objectPath(path: string): string {
    const bucket = encodeURIComponent(photoBucket);
    const object = path.split("/").map(encodeURIComponent).join("/");
    return `/object/${bucket}/${object}`;
}

async function storage(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    if (!key.startsWith("sb_")) {
        headers.set("authorization", `Bearer ${key}`);
    }
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    return await fetch(`${base}/storage/v1${path}`, { ...init, headers });
}

async function storageError(response: Response): Promise<HttpError> {
    const body = await response.json().catch(() => null);
    const message =
        isRecord(body) && typeof body.message === "string"
            ? body.message
            : `Supabase Storage request failed (${response.status})`;
    return new HttpError(502, message);
}
