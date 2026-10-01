import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../src/exports/collections";
import { collectionDocument } from "../fixtures";

const view = { id: "overview", name: "Overview", html: "<section><h2>Overview</h2></section>" };
const dashboard = {
    id: "starter",
    name: "Starter dashboard",
    icon: "layout",
    navigation: [{ id: "overview", label: "Start", use: "overview" }],
};

test("collection dashboards admit only local views and stable unique IDs", () => {
    const document = collectionDocument();
    const release = parseCollectionRelease({ ...document, views: [view], dashboards: [dashboard] });
    expect(release.dashboards?.[0]?.navigation).toEqual([{ id: "overview", label: "Start", use: "overview" }]);
    expect(release.dashboards?.[0]?.icon).toBe("layout");
    expect(() => parseCollectionRelease({ ...document, dashboards: [dashboard] })).toThrow(/view/);
    expect(() => parseCollectionRelease({ ...document, views: [view], dashboards: [dashboard, dashboard] })).toThrow();
    expect(() =>
        parseCollectionRelease({ ...document, views: [view], dashboards: [{ ...dashboard, navigation: [] }] }),
    ).toThrow(/at least one view/);
    expect(() =>
        parseCollectionRelease({
            ...document,
            views: [view],
            dashboards: [{ id: "legacy", name: "Legacy", views: [{ viewId: "overview", label: "Start" }] }],
        }),
    ).toThrow(/unknown property/i);
});

test("collection dashboard navigation supports tabs directly below the primary level", () => {
    const document = collectionDocument();
    const navigation = [
        {
            id: "workspace",
            label: "Workspace",
            childPlacement: "tabs",
            children: [{ id: "overview", label: "Overview", use: "overview" }],
        },
    ];
    const release = parseCollectionRelease({
        ...document,
        views: [view],
        dashboards: [{ id: "starter", name: "Starter", navigation, contracts: ["catalog.items"] }],
    });
    expect(release.dashboards?.[0]?.navigation).toEqual(navigation);
    expect(release.dashboards?.[0]?.contracts).toEqual(["catalog.items"]);
    expect(() =>
        parseCollectionRelease({
            ...document,
            views: [view],
            dashboards: [
                {
                    id: "starter",
                    name: "Starter",
                    navigation: [
                        {
                            id: "outer",
                            label: "Outer",
                            childPlacement: "lateral",
                            children: [
                                {
                                    id: "middle",
                                    label: "Middle",
                                    childPlacement: "lateral",
                                    children: [{ id: "overview", label: "Overview", use: "overview" }],
                                },
                            ],
                        },
                    ],
                },
            ],
        }),
    ).toThrow(/tabs|placement/);
});
