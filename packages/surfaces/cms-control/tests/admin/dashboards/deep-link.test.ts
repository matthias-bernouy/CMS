import { beforeEach, describe, expect, test } from "bun:test";
import { DashboardNav } from "cms-control/components/admin/Resources/Dashboards/DashboardNav";
import { DashboardView } from "cms-control/components/admin/Resources/Dashboards/DashboardView";

const selectedDashboard = "commerce-configuration";
const groups = [{
    source: {
        urn: "urn:commerce",
        id: "commerce",
        name: "Commerce",
        endpointCount: 1,
        dashboardCount: 2,
        readonly: false,
    },
    endpoints: [],
    dashboards: [
        { id: "commerce-products", source: "commerce", meta: { name: "Products" }, views: [] },
        { id: selectedDashboard, source: "commerce", meta: { name: "Settings" }, views: [] },
    ],
}];

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
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(selectionOf(component)).toBe(selectedDashboard);
            component.remove();
        }
    });

});

function selectionOf(component: HTMLElement): string {
    return (component as unknown as { selectedDashboard: string }).selectedDashboard;
}
