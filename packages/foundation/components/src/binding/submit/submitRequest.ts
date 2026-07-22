import { serializeForm } from "./formSerialization";
import type { FormSubmitResult, SubmitFormOptions } from "./types";

export async function submitForm(form: HTMLFormElement, options: SubmitFormOptions): Promise<FormSubmitResult> {
    const serialized = serializeForm(form, options);
    const headers = new Headers({ Accept: "application/json" });
    const init: RequestInit = { method: options.method, headers, signal: options.signal };

    if (serialized.kind === "json") {
        headers.set("Content-Type", "application/json");
        init.body = serialized.body;
    } else if (serialized.kind === "formData") {
        init.body = serialized.body;
    }

    try {
        const response = await fetch(serialized.url, init);
        const body = await readResponseBody(response);
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            body,
            message: response.ok ? "" : errorMessage(response, body),
            form,
        };
    } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") {
            return { ok: false, status: 0, statusText: "Aborted", body: null, message: "Aborted", form };
        }
        return {
            ok: false,
            status: 0,
            statusText: "Network Error",
            body: null,
            message: error instanceof Error ? error.message : String(error),
            form,
        };
    }
}

async function readResponseBody(response: Response): Promise<unknown> {
    if (response.status === 204) {
        return null;
    }
    const text = await response
        .clone()
        .text()
        .catch(() => "");
    if (text.trim() === "") {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return response.headers.get("content-type")?.includes("application/json") ? null : text;
    }
}

function errorMessage(response: Response, body: unknown): string {
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        return body.error;
    }
    if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
        return body.message;
    }
    return response.statusText || `Request failed (${response.status})`;
}
