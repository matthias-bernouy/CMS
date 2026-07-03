import type { DashboardDataRef, DashboardEndpointRef } from "@bernouy/cms-dashboards";
import { route } from "../api";
import { arrayAt, resolveBody, resolveParams, valueAt, type RuntimeVars } from "./expressions";

export async function fetchSourceJson(sourceId: string, ref: DashboardDataRef, vars: RuntimeVars): Promise<unknown> {
    const response = await fetch(sourceUrl(sourceId, ref, vars), { headers: { Accept: "application/json" } });
    return responseJson(response);
}

export async function sendSourceJson(sourceId: string, ref: DashboardEndpointRef, method: string, vars: RuntimeVars): Promise<unknown> {
    const body = resolveBody(ref.body, vars);
    const response = await fetch(sourceUrl(sourceId, ref, vars), {
        method,
        headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return responseJson(response);
}

export async function sendSourceForm(sourceId: string, ref: DashboardEndpointRef, method: string, vars: RuntimeVars, body: FormData): Promise<unknown> {
    const response = await fetch(sourceUrl(sourceId, ref, vars), {
        method,
        headers: { Accept: "application/json" },
        body,
    });
    return responseJson(response);
}

function sourceUrl(sourceId: string, ref: DashboardEndpointRef, vars: RuntimeVars): URL {
    const url = new URL(route(`/.cms/sources/${encodeURIComponent(sourceId)}/${encodeURIComponent(ref.endpoint)}`), window.location.origin);
    for (const [key, value] of Object.entries(resolveParams(ref.params, vars))) url.searchParams.set(key, value);
    return url;
}

async function responseJson(response: Response): Promise<unknown> {
    if (!response.ok) throw new Error(await response.text() || `Source request failed (${response.status})`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return response.text();
    return response.json();
}

export function itemsFrom(data: unknown, ref: DashboardDataRef): unknown[] {
    if (!ref.itemsPath) return Array.isArray(data) ? data : [];
    return arrayAt(data, ref.itemsPath);
}

export function itemFrom(data: unknown, ref: DashboardDataRef): unknown {
    return ref.itemPath ? valueAt(data, ref.itemPath) : data;
}
