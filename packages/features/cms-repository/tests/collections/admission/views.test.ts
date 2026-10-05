import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../src/exports/collections";
import { collectionDocument } from "../fixtures";

test("collection views keep Control HTML while rejecting executable markup", () => {
    const document = collectionDocument({ "view.overview.name": "Overview" });
    const view = {
        id: "overview",
        name: "view.overview.name",
        icon: "star",
        html: "<section><h2>Overview</h2><atlas-panel></atlas-panel></section>",
    };
    const release = parseCollectionRelease({ ...document, views: [view] });
    expect(release.views?.[0]?.html).toBe(view.html);
    expect(release.views?.[0]?.icon).toBe("star");
    const withBloc = parseCollectionRelease({
        ...document,
        views: [
            {
                ...view,
                html: '<section><atlas-panel appearance="compact" aria-label="Panel"></atlas-panel></section>',
            },
        ],
    });
    expect(withBloc.views?.[0]?.uses).toEqual(["atlas-panel"]);
    const bound = {
        ...view,
        requires: [{ contractId: "catalog.items", capabilityId: "item.list", versionRange: "^1.0.0" }],
        html: '<section cms-source="/.cms/call/catalog.items/item.list as catalog" cms-source-method="POST" cms-source-body="{}"><p cms-condition="$source.loaded" cms-repeat="catalog.items as item">{{ item.name }}</p></section>',
    };
    expect(parseCollectionRelease({ ...document, views: [bound] }).views?.[0]?.html).toBe(bound.html);
    expect(parseCollectionRelease({ ...document, views: [bound] }).views?.[0]?.requires).toEqual(bound.requires);
    expect(() => parseCollectionRelease({ ...document, views: [{ ...bound, requires: [] }] })).toThrow(/exactly match/);
    const localized = {
        ...document,
        locale: "en",
        texts: [{ id: "heading", values: { en: "Overview" } }],
        assets: [
            {
                id: "logo",
                mediaType: "image/svg+xml",
                byteLength: 0,
                digest: `sha256:${"0".repeat(64)}`,
            },
        ],
        views: [
            {
                ...view,
                html: '<section><h2>{{ cms.i18n.atlas.heading }}</h2><atlas-panel artwork="{{ cms.asset.atlas.logo }}"></atlas-panel></section>',
            },
        ],
    };
    expect(() => parseCollectionRelease(localized)).not.toThrow();
    expect(() =>
        parseCollectionRelease({
            ...localized,
            views: [{ ...view, html: "<section>{{ cms.i18n.atlas.unknown }}</section>" }],
        }),
    ).toThrow(/unknown collection text/);
    expect(() =>
        parseCollectionRelease({
            ...localized,
            views: [
                {
                    ...view,
                    html: '<section><atlas-panel artwork="{{ cms.asset.atlas.unknown }}"></atlas-panel></section>',
                },
            ],
        }),
    ).toThrow(/unknown or unimported collection asset/);
    for (const html of [
        "<script>alert(1)</script>",
        '<a href="https://example.com">Leave</a>',
        '<div style="color:red">Inline style</div>',
        '<div onclick="run()">Handler</div>',
        "<atlas-unknown></atlas-unknown>",
        '<section cms-source="/api/users" cms-source-method="POST"></section>',
        '<section cms-source="/.cms/call/catalog.items/item.list" cms-source-method="GET"></section>',
        '<section cms-source="/.cms/call/catalog.items/item.list" cms-source-method="POST" cms-source-body="[]"></section>',
    ]) {
        expect(() => parseCollectionRelease({ ...document, views: [{ ...bound, html }] })).toThrow();
    }
});
