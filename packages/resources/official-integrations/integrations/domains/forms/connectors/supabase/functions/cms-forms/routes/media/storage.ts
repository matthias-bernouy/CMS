import { serviceRoleKey, supabaseUrl } from "../../auth.ts";
import { HttpError, isRecord } from "../../http.ts";

export async function uploadStorageImage(bucket: string, path: string, file: File): Promise<void> {
    const response = await storageObject(bucket, path, {
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

export async function downloadStorageImage(bucket: string, path: string): Promise<Response> {
    const response = await storageObject(bucket, path, { method: "GET" });
    if (response.status === 404) {
        throw new HttpError(404, "form image not found");
    }
    if (!response.ok) {
        throw await storageError(response);
    }
    return response;
}

export async function deleteStorageImageBestEffort(bucket: string, path: string): Promise<void> {
    try {
        const response = await storageObject(bucket, path, { method: "DELETE" });
        if (!response.ok && response.status !== 404) {
            console.warn(`Unable to remove Forms media object (${response.status})`);
        }
    } catch (error) {
        console.warn("Unable to remove Forms media object", error);
    }
}

async function storageObject(bucket: string, path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    if (key.startsWith("sb_")) {
        headers.delete("authorization");
    } else {
        headers.set("authorization", `Bearer ${key}`);
    }
    const bucketPath = encodeURIComponent(bucket);
    const objectPath = path.split("/").map(encodeURIComponent).join("/");
    return await fetch(`${supabaseUrl()}/storage/v1/object/${bucketPath}/${objectPath}`, { ...init, headers });
}

async function storageError(response: Response): Promise<HttpError> {
    const body = await response.json().catch(() => null);
    const message =
        isRecord(body) && typeof body.message === "string"
            ? body.message
            : `Supabase Storage request failed (${response.status})`;
    return new HttpError(502, message);
}
