import type { DashboardWNavigationItem } from "./WNavigationItem";

export function navigationDragItem(event: Event): DashboardWNavigationItem | null {
    const fromPath = event
        .composedPath()
        .find(
            (target): target is DashboardWNavigationItem =>
                target instanceof HTMLElement && target.matches("cms-dashboard-w-navigation-item"),
        );
    if (fromPath) {
        return fromPath;
    }
    const target = event.target;
    return target instanceof Element
        ? target.closest<DashboardWNavigationItem>("cms-dashboard-w-navigation-item")
        : null;
}
