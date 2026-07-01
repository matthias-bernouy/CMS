import type { DashboardListResponse } from "./types";

export function basePath(): string {
    const raw = document.querySelector('meta[name="basePath"]')?.getAttribute("content") ?? "";
    return raw.replace(/\/+$/, "");
}

export function route(path: string): string {
    return `${basePath()}${path}`;
}

export function currentSource(): string {
    return new URL(window.location.href).searchParams.get("source") ?? "";
}

export function currentDashboard(): string {
    return new URL(window.location.href).searchParams.get("dashboard") ?? "";
}

export async function fetchDashboards(): Promise<DashboardListResponse> {
    return getJson<DashboardListResponse>(route("/api/dashboards"));
}

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<T>;
}
