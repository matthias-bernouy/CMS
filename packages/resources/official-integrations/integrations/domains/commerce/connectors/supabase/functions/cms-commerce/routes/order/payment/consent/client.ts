import { requiredEnv } from "../../../../core/env.ts";
import { HttpError } from "../../../../core/errors.ts";
import { isRecord } from "../../../../core/records.ts";
import type { JsonRecord } from "../../../../core/types.ts";

const timeoutMilliseconds = 5000;
const maximumResponseBytes = 1_048_576;

/** Consent is an explicit deployment dependency; only its service API is used. */
export async function consentRequest(path: string, body?: JsonRecord): Promise<JsonRecord> {
    const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
    try {
        const response = await fetch(`${base}/functions/v1/cms-consent${path}`, {
            method: body ? "POST" : "GET",
            headers: {
                authorization: `Bearer ${requiredEnv("CMS_CONSENT_API_KEY")}`,
                "content-type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: controller.signal,
            redirect: "error",
        });
        const result = await responseObject(response);
        if (!response.ok) {
            if (response.status === 409 && result.error === "CONSENT_DOCUMENT_VERSION_CHANGED") {
                throw new HttpError(409, "LEGAL_DOCUMENT_VERSION_CHANGED");
            }
            throw new HttpError(503, "CONSENT_UNAVAILABLE");
        }
        return result;
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        throw new HttpError(503, "CONSENT_UNAVAILABLE");
    } finally {
        clearTimeout(timeout);
    }
}

async function responseObject(response: Response): Promise<JsonRecord> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new HttpError(503, "CONSENT_UNAVAILABLE");
    }
    const decoder = new TextDecoder();
    let size = 0;
    let text = "";
    while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
            break;
        }
        size += chunk.value.byteLength;
        if (size > maximumResponseBytes) {
            await reader.cancel();
            throw new HttpError(503, "CONSENT_UNAVAILABLE");
        }
        text += decoder.decode(chunk.value, { stream: true });
    }
    const result: unknown = JSON.parse(text + decoder.decode());
    if (!isRecord(result)) {
        throw new HttpError(503, "CONSENT_UNAVAILABLE");
    }
    return result;
}
