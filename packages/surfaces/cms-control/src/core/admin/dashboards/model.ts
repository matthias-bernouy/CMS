import { randomUUID } from "node:crypto";
import type { DashboardRecord } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";
import { dashboardCollections } from "./access";

export async function availableDashboardViews(cms: ControlCms) {
    const { store, siteId } = dashboardCollections(cms);
    const snapshot = await store.snapshot(siteId);
    return snapshot.collections.flatMap((item) =>
        (item.release.views ?? []).map((view) => ({
            collectionId: item.collectionId,
            collectionName: item.release.name,
            viewId: view.id,
            name: view.name,
            icon: view.icon ?? "layout",
            description: view.description ?? "",
        })),
    );
}

export function dashboardName(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || value.length > 120) {
        throw new TypeError("Dashboard name must be between 1 and 120 characters");
    }
    return value.trim();
}

export function newDashboard(siteId: string, name: string): DashboardRecord {
    return { id: randomUUID(), siteId, name, enabled: false, revision: 1, navigation: [] };
}
