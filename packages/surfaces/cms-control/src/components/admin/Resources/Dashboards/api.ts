import type { DashboardOption } from "@bernouy/cms-dashboards";
import type { DashboardListResponse } from "./types";

export const DASHBOARD_SELECTION_EVENT = "cms-dashboards:selection";

export type DashboardUserOption = {
    sub: string;
    label?: string;
    displayName?: string;
    email?: string;
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

export function defaultDashboardSource(groups: DashboardListResponse): string {
    return groups.find((group) => group.dashboards.length > 0)?.source.id ?? groups[0]?.source.id ?? "";
}

export function replaceSelectionUrl(selection: DashboardSelection): void {
    history.replaceState(null, "", selectionUrl(selection));
}

export function pushSelectionUrl(selection: DashboardSelection): void {
    history.pushState(null, "", selectionUrl(selection));
}

function selectionUrl(selection: DashboardSelection): string {
    const scoped = Boolean(document.documentElement.dataset.dashboardScope);
    const target = scoped ? new URL(window.location.href) : new URL(route("/admin/sources"), window.location.origin);
    const params = target.searchParams;
    for (const key of ["source", "dashboard", "collection", "row"]) {
        params.delete(key);
    }
    if (selection.source) {
        params.set("source", selection.source);
    }
    if (selection.dashboard) {
        params.set("dashboard", selection.dashboard);
    }
    if (selection.collection && selection.row) {
        params.set("collection", selection.collection);
        params.set("row", selection.row);
    }
    target.search = params.toString();
    return `${target.pathname}${target.search}`;
}

export function dispatchDashboardSelection(selection: DashboardSelection): void {
    window.dispatchEvent(new CustomEvent<DashboardSelection>(DASHBOARD_SELECTION_EVENT, { detail: selection }));
}

export function dashboardUserOptions(users: DashboardUserOption[]): DashboardOption[] {
    return users.flatMap((user) => {
        const sub = typeof user.sub === "string" ? user.sub : "";
        if (!sub) {
            return [];
        }
        const email = cleanText(user.email);
        const fallbackLabel = cleanText(user.label);
        const name = cleanText(user.displayName) || (fallbackLabel !== email ? fallbackLabel : "");
        const humanLabel = name && email ? `${name} — ${email}` : name || email || sub;
        const metadata = sub !== humanLabel ? sub : "";
        return [{ value: sub, label: metadata ? `${humanLabel} · ${metadata}` : humanLabel }];
    });
}

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}
