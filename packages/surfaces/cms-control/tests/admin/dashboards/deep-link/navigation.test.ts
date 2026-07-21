import { beforeEach, describe, expect, test } from "bun:test";
import { DashboardNav } from "cms-control/components/admin/Resources/Dashboards/DashboardNav";
import { DashboardView } from "cms-control/components/admin/Resources/Dashboards/DashboardView";
import { DASHBOARD_SELECTION_EVENT } from "cms-control/components/admin/Resources/Dashboards/api";
import { DetailResourceState } from "cms-control/components/admin/Resources/Dashboards/domain";
import { groups, selectedDashboard } from "./fixtures";

describe("dashboard deep links", () => {
    beforeEach(() => {
        document.body.replaceChildren();
        window.history.replaceState(null, "", `/admin/sources?source=commerce&dashboard=${selectedDashboard}`);
    });

    test("preserves the URL selection while bound dashboard data hydrates", async () => {
        for (const component of [new DashboardNav(), new DashboardView()]) {
            document.body.append(component);
            expect(selectionOf(component)).toBe(selectedDashboard);

            const target = component.shadowRoot!.querySelector<HTMLElement>(
                "[data-nav-groups-json], [data-dashboard-groups-json]",
            )!;
            const attribute = target.hasAttribute("data-nav-groups-json")
                ? "data-nav-groups-json"
                : "data-dashboard-groups-json";
            target.setAttribute(attribute, JSON.stringify(groups));
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(selectionOf(component)).toBe(selectedDashboard);
            component.remove();
        }
    });

    test("invalidates pending action resources on navigation and disconnect", () => {
        const component = new DashboardView();
        document.body.append(component);
        const resources = (component as unknown as { detailResource: DetailResourceState }).detailResource;
        const finishNavigation = resources.beginAction();

        window.dispatchEvent(
            new CustomEvent(DASHBOARD_SELECTION_EVENT, {
                detail: { source: "commerce", dashboard: selectedDashboard },
            }),
        );

        expect(finishNavigation()).toBe("stale");
        const finishDisconnect = resources.beginAction();
        component.remove();
        expect(finishDisconnect()).toBe("stale");
    });
});

function selectionOf(component: HTMLElement): string {
    return (component as unknown as { selectedDashboard: string }).selectedDashboard;
}
