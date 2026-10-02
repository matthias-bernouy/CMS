import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../src/exports/collections";
import { collectionDocument } from "../fixtures";

const view = { id: "overview", name: "view.overview.name", html: "<section><h2>Overview</h2></section>" };
const dashboard = {
    id: "starter",
    name: "dashboard.starter.name",
    icon: "layout",
    navigation: [{ id: "overview", label: "nav.starter.overview", use: "overview" }],
};

const translations = {
    "dashboard.legacy.name": "Legacy",
    "dashboard.starter.name": "Starter dashboard",
    "nav.starter.middle": "Middle",
    "nav.starter.outer": "Outer",
    "nav.starter.overview": "Overview",
    "nav.starter.workspace": "Workspace",
    "view.overview.name": "Overview",
};

test("collection dashboards admit only local views and stable unique IDs", () => {
    const document = collectionDocument(translations);
    const release = parseCollectionRelease({ ...document, views: [view], dashboards: [dashboard] });
    expect(release.dashboards?.[0]?.navigation).toEqual([
        { id: "overview", label: "nav.starter.overview", use: "overview" },
    ]);
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
            dashboards: [
                {
                    id: "legacy",
                    name: "dashboard.legacy.name",
                    views: [{ viewId: "overview", label: "nav.starter.overview" }],
                },
            ],
        }),
    ).toThrow(/unknown property/i);
});

test("collection dashboard navigation supports tabs directly below the primary level", () => {
    const document = collectionDocument(translations);
    const navigation = [
        {
            id: "workspace",
            label: "nav.starter.workspace",
            childPlacement: "tabs",
            children: [{ id: "overview", label: "nav.starter.overview", use: "overview" }],
        },
    ];
    const release = parseCollectionRelease({
        ...document,
        views: [view],
        dashboards: [{ id: "starter", name: "dashboard.starter.name", navigation, contracts: ["catalog.items"] }],
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
                    name: "dashboard.starter.name",
                    navigation: [
                        {
                            id: "outer",
                            label: "nav.starter.outer",
                            childPlacement: "lateral",
                            children: [
                                {
                                    id: "middle",
                                    label: "nav.starter.middle",
                                    childPlacement: "lateral",
                                    children: [{ id: "overview", label: "nav.starter.overview", use: "overview" }],
                                },
                            ],
                        },
                    ],
                },
            ],
        }),
    ).toThrow(/tabs|placement/);
});
