import { expect, test } from "bun:test";
import type { ControlCms } from "../../../src/ControlCms";
import { navigationMounts, parseDashboardNavigation } from "../../../src/core/admin/dashboards/navigation";

const cms = {
    config: {
        collections: {
            siteId: "site",
            store: {
                snapshot: async () => ({
                    collections: [
                        {
                            collectionId: "test",
                            release: {
                                name: "Test",
                                views: [
                                    { id: "overview", name: "Overview" },
                                    { id: "resources", name: "Resources" },
                                ],
                            },
                        },
                    ],
                }),
            },
        },
    },
} as unknown as ControlCms;

test("dashboard navigation preserves primary-to-tabs placement and derives mounts", async () => {
    const navigation = await parseDashboardNavigation(cms, [
        {
            id: "workspace",
            label: "Workspace",
            childPlacement: "tabs",
            children: [
                { id: "overview", label: "Overview", use: "test:overview" },
                { id: "resources", label: "Resources", use: "test:resources" },
            ],
        },
    ]);
    expect(navigation[0]?.childPlacement).toBe("tabs");
    expect(navigationMounts(navigation).map((mount) => mount.viewId)).toEqual(["overview", "resources"]);
    await expect(
        parseDashboardNavigation(cms, [
            { id: "duplicate", label: "One", use: "test:overview" },
            { id: "duplicate", label: "Two", use: "test:overview" },
        ]),
    ).rejects.toThrow();
});
