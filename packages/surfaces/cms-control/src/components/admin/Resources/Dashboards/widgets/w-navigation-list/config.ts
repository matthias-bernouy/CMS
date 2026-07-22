import type { DashboardWidget } from "@bernouy/cms-dashboards";

export type NavigationListWidget = Extract<DashboardWidget, { widget: "w-navigation-list" }>;

export function parseNavigationListWidget(value: string): NavigationListWidget | null {
    try {
        const widget = value ? (JSON.parse(value) as NavigationListWidget) : null;
        return widget?.widget === "w-navigation-list" ? widget : null;
    } catch {
        return null;
    }
}
