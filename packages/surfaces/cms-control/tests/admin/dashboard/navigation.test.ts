import { expect, test } from "bun:test";
import type { ControlCms } from "../../../src/ControlCms";
import { renderDashboardSwitcher } from "../../../src/components/admin/Resources/Dashboards/navigation/runtime";
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

test("dashboard switcher uses dashboard icons and exposes admin return for administrators", async () => {
    document.head.innerHTML = '<meta name="basePath" content="">';
    document.body.innerHTML = "<div data-dashboard-switcher></div><div data-admin-return hidden></div>";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
        new Response(
            JSON.stringify({
                dashboards: [
                    {
                        id: "current",
                        name: "Ulvia workspace",
                        icon: "package",
                        mounts: [{ collectionId: "ulvia-official", viewId: "overview" }],
                    },
                    {
                        id: "private",
                        name: "Private dashboard",
                        icon: "users",
                        mounts: [{ collectionId: "ulvia-official", viewId: "resources" }],
                    },
                ],
            }),
        )) as unknown as typeof fetch;
    try {
        await renderDashboardSwitcher("current");
    } finally {
        globalThis.fetch = originalFetch;
    }

    const menu = document.querySelector("[data-dashboard-switcher] p9r-action-menu");
    expect(menu?.getAttribute("label")).toBe("Ulvia workspace");
    expect(document.querySelector(".dashboard-switcher > cms-library-icon")?.getAttribute("name")).toBe("package");
    expect(menu?.querySelectorAll("p9r-action-menu-item")).toHaveLength(2);
    expect(menu?.querySelector('[data-dashboard-id="current"]')?.getAttribute("aria-current")).toBe("page");
    expect(document.querySelector("[data-admin-return]")?.hasAttribute("hidden")).toBeFalse();
});

test("dashboard switcher keeps admin return hidden for assigned members", async () => {
    document.head.innerHTML = '<meta name="basePath" content="">';
    document.body.innerHTML = "<div data-dashboard-switcher></div><div data-admin-return hidden></div>";
    const originalFetch = globalThis.fetch;
    let requestCount = 0;
    globalThis.fetch = (async () => {
        requestCount += 1;
        return requestCount === 1
            ? new Response(null, { status: 403 })
            : new Response(
                  JSON.stringify({
                      dashboards: [
                          {
                              id: "member",
                              name: "Member dashboard",
                              mounts: [{ collectionId: "test", viewId: "overview" }],
                          },
                      ],
                  }),
              );
    }) as unknown as typeof fetch;
    try {
        await renderDashboardSwitcher("member");
    } finally {
        globalThis.fetch = originalFetch;
    }

    expect(requestCount).toBe(2);
    expect(document.querySelector("[data-admin-return]")?.hasAttribute("hidden")).toBeTrue();
});
