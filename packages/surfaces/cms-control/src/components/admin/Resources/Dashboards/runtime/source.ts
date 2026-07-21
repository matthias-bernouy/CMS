import type { DashboardDataRef, DashboardEndpointRef } from "@bernouy/cms-dashboards";
import { route } from "../api";
import { arrayAt, resolveBody, resolveParams, valueAt, type RuntimeVars } from "./expressions";

export async function fetchSourceJson(
    sourceId: string,
    ref: DashboardDataRef,
    vars: RuntimeVars,
    options: { signal?: AbortSignal } = {},
): Promise<unknown> {
    const response = await fetch(sourceUrl(sourceId, ref, vars), {
        headers: { Accept: "application/json" },
        signal: options.signal,
    });
    return responseJson(response);
}

export function sourceRequestKey(sourceId: string, ref: DashboardDataRef, vars: RuntimeVars): string {
    const url = sourceUrl(sourceId, ref, vars);
    url.searchParams.sort();
    return url.href;
}

export async function sendSourceJson(
    sourceId: string,
    ref: DashboardEndpointRef,
    method: string,
    vars: RuntimeVars,
): Promise<unknown> {
    const response = await sendSourceResponse(sourceId, ref, method, vars, "application/json");
    return responseJson(response);
}

export async function sendSourceForm(
    sourceId: string,
    ref: DashboardEndpointRef,
    method: string,
    vars: RuntimeVars,
    body: FormData,
): Promise<unknown> {
    const response = await fetch(sourceUrl(sourceId, ref, vars), {
        method,
        headers: { Accept: "application/json" },
        body,
    });
    return responseJson(response);
}

export async function sendSourceDownload(
    sourceId: string,
    ref: DashboardEndpointRef,
    method: string,
    vars: RuntimeVars,
): Promise<{ blob: Blob; filename?: string }> {
    const response = await sendSourceResponse(sourceId, ref, method, vars, "*/*");
    if (!response.ok) {
        throw new Error((await response.text()) || `Source request failed (${response.status})`);
    }
    const filename = filenameFromDisposition(response.headers.get("content-disposition"));
    return {
        blob: await response.blob(),
        ...(filename ? { filename } : {}),
    };
}

async function sendSourceResponse(
    sourceId: string,
    ref: DashboardEndpointRef,
    method: string,
    vars: RuntimeVars,
    accept: string,
): Promise<Response> {
    const body = resolveBody(ref.body, vars);
    return fetch(sourceUrl(sourceId, ref, vars), {
        method,
        headers: body === undefined ? { Accept: accept } : { Accept: accept, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

function sourceUrl(sourceId: string, ref: DashboardEndpointRef, vars: RuntimeVars): URL {
    const targetSourceId = ref.sourceId ?? sourceId;
    const url = new URL(
        route(`/.cms/sources/${encodeURIComponent(targetSourceId)}/${encodeURIComponent(ref.endpoint)}`),
        window.location.origin,
    );
    for (const [key, value] of Object.entries(resolveParams(ref.params, vars))) {
        url.searchParams.set(key, value);
    }
    return url;
}

async function responseJson(response: Response): Promise<unknown> {
    if (!response.ok) {
        throw new Error((await response.text()) || `Source request failed (${response.status})`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
        return response.text();
    }
    return response.json();
}

function filenameFromDisposition(value: string | null): string | undefined {
    const match = value?.match(/filename="?([^";]+)"?/i);
    return match?.[1]?.trim() || undefined;
}

export function itemsFrom(data: unknown, ref: DashboardDataRef): unknown[] {
    if (!ref.itemsPath) {
        return Array.isArray(data) ? data : [];
    }
    return arrayAt(data, ref.itemsPath);
}

export function itemFrom(data: unknown, ref: DashboardDataRef): unknown {
    return ref.itemPath ? valueAt(data, ref.itemPath) : data;
}
