import type { DashboardListResponse } from "./types";

export const DASHBOARD_SELECTION_EVENT = "cms-dashboards:selection";

export type DashboardUserOption = {
    sub: string;
    displayName?: string;
    email?: string;
    role?: string;
};

export type DashboardSelection = {
    source: string;
    dashboard: string;
    collection?: string;
    row?: string;
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

export function currentCollection(): string {
    return new URL(window.location.href).searchParams.get("collection") ?? "";
}

export function currentRow(): string {
    return new URL(window.location.href).searchParams.get("row") ?? "";
}

export function currentSelection(): DashboardSelection {
    const collection = currentCollection();
    const row = currentRow();
    return {
        source: currentSource(),
        dashboard: currentDashboard(),
        ...(collection && row ? { collection, row } : {}),
    };
}

export function replaceSelectionUrl(selection: DashboardSelection): void {
    history.replaceState(null, "", selectionUrl(selection));
}

export function pushSelectionUrl(selection: DashboardSelection): void {
    history.pushState(null, "", selectionUrl(selection));
}

function selectionUrl(selection: DashboardSelection): string {
    const params = new URLSearchParams();
    if (selection.source) params.set("source", selection.source);
    if (selection.dashboard) params.set("dashboard", selection.dashboard);
    if (selection.collection && selection.row) {
        params.set("collection", selection.collection);
        params.set("row", selection.row);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return route(`/admin/sources${suffix}`);
}

export function dispatchDashboardSelection(selection: DashboardSelection): void {
    window.dispatchEvent(new CustomEvent<DashboardSelection>(DASHBOARD_SELECTION_EVENT, { detail: selection }));
}

export async function fetchDashboards(): Promise<DashboardListResponse> {
    return getJson<DashboardListResponse>(route("/api/dashboards"));
}

export async function fetchDashboardUsers(): Promise<DashboardUserOption[]> {
    return getJson<DashboardUserOption[]>(route("/api/users"));
}

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<T>;
}
