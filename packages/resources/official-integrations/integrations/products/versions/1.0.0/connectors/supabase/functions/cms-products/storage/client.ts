import { HttpError } from "../core/errors.ts";
import { requiredEnv, serviceRoleKey } from "../core/env.ts";
import { isRecord } from "../core/records.ts";
import { mediaBucket } from "./constants.ts";

export async function storageObject(path: string, init: RequestInit): Promise<Response> {
    const key = serviceRoleKey();
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("authorization", `Bearer ${key}`);

    const bucket = encodeURIComponent(mediaBucket);
    const objectPath = path.split("/").map(encodeURIComponent).join("/");
    return fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, { ...init, headers });
}

export async function storageError(response: Response): Promise<HttpError> {
    const text = await response.text().catch(() => "");
    let message = text.trim();
    try {
        const data = JSON.parse(text);
        if (isRecord(data) && typeof data.message === "string") message = data.message;
        if (isRecord(data) && typeof data.error === "string") message = data.error;
    } catch {
        // Keep the raw text fallback.
    }
    return new HttpError(502, message || `Supabase Storage request failed (${response.status})`);
}
