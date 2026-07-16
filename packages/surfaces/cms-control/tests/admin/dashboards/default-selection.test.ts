import { describe, expect, test } from "bun:test";
import { defaultDashboardSource } from "cms-control/components/admin/Resources/Dashboards/api";
import type { DashboardSourceGroup } from "cms-control/components/admin/Resources/Dashboards/types";

describe("dashboard default selection", () => {
    test("selects the first source that actually has a dashboard", () => {
        expect(defaultDashboardSource([
            group("system-auth", 0),
            group("commerce", 2),
            group("delivery", 1),
        ])).toBe("commerce");
    });

    test("falls back to the first source when every source is dashboard-less", () => {
        expect(defaultDashboardSource([
            group("system-auth", 0),
            group("stripe-connect", 0),
        ])).toBe("system-auth");
    });
});

function group(id: string, dashboardCount: number): DashboardSourceGroup {
    return {
        source: {
            urn: `urn:${id}`,
            id,
            name: id,
            endpointCount: 1,
            dashboardCount,
            readonly: false,
        },
        endpoints: [],
        dashboards: Array.from({ length: dashboardCount }, (_, index) => ({
            id: `${id}-${index}`,
            source: id,
            views: [],
        })),
    };
}
