import type { DashboardDataRef, DashboardEndpointRef } from "@bernouy/cms-dashboards";
import { route } from "../api";
import { arrayAt, resolveBody, resolveParams, type RuntimeVars } from "./expressions";

/** Mutations must use the resource already presented by the bound detail. */
export function requireDetailResource(resource: unknown): unknown {
    if (resource === undefined || resource === null) {
        throw new Error("The detail is not loaded. Wait for it to load before trying again.");
    }
    return resource;
}

export async function sendSourceDownload(
    sourceId: string,
    ref: DashboardEndpointRef,
    method: string,
    vars: RuntimeVars,
): Promise<{ blob: Blob; filename?: string }> {
    const response = await sendDownloadResponse(sourceId, ref, method, vars, "*/*");
    if (!response.ok) {
        throw new Error((await response.text()) || `Source request failed (${response.status})`);
    }
    const filename = filenameFromDisposition(response.headers.get("content-disposition"));
    return {
        blob: await response.blob(),
        ...(filename ? { filename } : {}),
    };
}

async function sendDownloadResponse(
    sourceId: string,
    ref: DashboardEndpointRef,
    method: string,
    vars: RuntimeVars,
    accept: string,
): Promise<Response> {
    const body = resolveBody(ref.body, vars);
    // Binary downloads need the response headers and Blob, which JSON binding does not expose.
    return fetch(sourceUrl(sourceId, ref, vars), {
        method,
        headers: body === undefined ? { Accept: accept } : { Accept: accept, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

export function sourceUrl(sourceId: string, ref: DashboardEndpointRef, vars: RuntimeVars): URL {
    const targetSourceId = ref.sourceId ?? sourceId;
    const dashboardId = document.documentElement.dataset.dashboardScope;
    const prefix = dashboardId ? `/.cms/dashboards/${encodeURIComponent(dashboardId)}/sources` : "/.cms/sources";
    const url = new URL(
        route(`${prefix}/${encodeURIComponent(targetSourceId)}/${encodeURIComponent(ref.endpoint)}`),
        window.location.origin,
    );
    for (const [key, value] of Object.entries(resolveParams(ref.params, vars))) {
        url.searchParams.set(key, value);
    }
    return url;
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
