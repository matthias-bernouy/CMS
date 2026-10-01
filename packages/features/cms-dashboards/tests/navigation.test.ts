import { expect, test } from "bun:test";
import { dashboardNavigationViews, parseDashboardNavigation } from "../src/exports";

test("dashboard navigation is normalized once for collection and site consumers", () => {
    const navigation = parseDashboardNavigation(
        [
            {
                id: "workspace.main",
                label: " Workspace ",
                childPlacement: "tabs",
                children: [{ id: "overview", label: "Overview", use: "collection:overview" }],
            },
        ],
        new Set(["collection:overview"]),
    );

    expect(navigation[0]?.label).toBe("Workspace");
    expect(dashboardNavigationViews(navigation)).toEqual([{ use: "collection:overview", label: "Overview" }]);
});

test("dashboard navigation rejects unavailable or repeated views and invalid nesting", () => {
    expect(() =>
        parseDashboardNavigation(
            [
                { id: "one", label: "One", use: "collection:overview" },
                { id: "two", label: "Two", use: "collection:overview" },
            ],
            new Set(["collection:overview"]),
        ),
    ).toThrow("used only once");
    expect(() =>
        parseDashboardNavigation([{ id: "missing", label: "Missing", use: "collection:missing" }], new Set()),
    ).toThrow("available");
    expect(() =>
        parseDashboardNavigation([
            {
                id: "empty",
                label: "Empty",
                childPlacement: "tabs",
                children: [],
            },
        ]),
    ).toThrow("needs children");
});
