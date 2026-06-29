import type { SourceDetail, SourceRow } from "./types";

export function basePath(): string {
    const raw = document.querySelector('meta[name="basePath"]')?.getAttribute("content") ?? "";
    return raw.replace(/\/+$/, "");
}

export function route(path: string): string {
    return `${basePath()}${path}`;
}

export function currentUrn(): string {
    return new URL(window.location.href).searchParams.get("urn") ?? "";
}

export async function fetchSources(): Promise<SourceRow[]> {
    return getJson<SourceRow[]>(route("/api/sources/list"));
}

export async function fetchSource(urn: string): Promise<SourceDetail> {
    return getJson<SourceDetail>(route(`/api/sources?urn=${encodeURIComponent(urn)}`));
}

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<T>;
}
