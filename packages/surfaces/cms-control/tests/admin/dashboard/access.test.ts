import { expect, test } from "bun:test";
import type { DashboardRecord } from "@bernouy/cms-dashboards";
import { canReadDashboard } from "../../../src/core/admin/dashboards/access";

test("dashboard activation and direct membership gate every mounted view", () => {
    const record: DashboardRecord = {
        id: "test",
        siteId: "default",
        name: "Test",
        enabled: true,
        revision: 1,
        mounts: [{ collectionId: "test", viewId: "overview", label: "Overview" }],
    };
    expect(canReadDashboard(record, false, false)).toBe(false);
    expect(canReadDashboard(record, false, true)).toBe(true);
    expect(canReadDashboard({ ...record, enabled: false }, false, true)).toBe(false);
    expect(canReadDashboard({ ...record, enabled: false }, true, false)).toBe(true);
});
