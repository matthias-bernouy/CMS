import { parseDashboardNavigation as parseNavigation, type DashboardNavigationItem } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";
import { availableDashboardViews } from "./model";

export async function parseDashboardNavigation(cms: ControlCms, value: unknown): Promise<DashboardNavigationItem[]> {
    const available = new Set(
        (await availableDashboardViews(cms)).map((view) => `${view.collectionId}:${view.viewId}`),
    );
    return parseNavigation(value, available);
}
