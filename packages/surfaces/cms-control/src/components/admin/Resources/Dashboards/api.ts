import type { DashboardListResponse } from "./types";

export const DASHBOARD_SELECTION_EVENT = "cms-dashboards:selection";

export type DashboardSelection = {
    source: string;
    dashboard: string;
};

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

export function currentSelection(): DashboardSelection {
    return { source: currentSource(), dashboard: currentDashboard() };
}

export function replaceSelectionUrl(selection: DashboardSelection): void {
    const params = new URLSearchParams();
    if (selection.source) params.set("source", selection.source);
    if (selection.dashboard) params.set("dashboard", selection.dashboard);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    history.replaceState(null, "", route(`/admin/sources${suffix}`));
}

export function dispatchDashboardSelection(selection: DashboardSelection): void {
    window.dispatchEvent(new CustomEvent<DashboardSelection>(DASHBOARD_SELECTION_EVENT, { detail: selection }));
}

export async function fetchDashboards(): Promise<DashboardListResponse> {
    return getJson<DashboardListResponse>(route("/api/dashboards"));
}

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<T>;
}
