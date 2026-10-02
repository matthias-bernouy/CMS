import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../src/exports/collections";
import { collectionDocument } from "../fixtures";

test("collection views keep Control HTML while rejecting executable markup", () => {
    const document = collectionDocument({ "view.overview.name": "Overview" });
    const view = {
        id: "overview",
        name: "view.overview.name",
        icon: "star",
        html: "<section><h2>{{ dashboard.name }}</h2><atlas-panel></atlas-panel></section>",
    };
    const release = parseCollectionRelease({ ...document, views: [view] });
    expect(release.views?.[0]?.html).toBe(view.html);
    expect(release.views?.[0]?.icon).toBe("star");
    const bound = {
        ...view,
        html: '<section cms-source="/.cms/call/catalog.items/item.list as catalog" cms-source-method="POST" cms-source-body="{}"><p cms-condition="$source.loaded" cms-repeat="catalog.items as item">{{ item.name }}</p></section>',
    };
    expect(parseCollectionRelease({ ...document, views: [bound] }).views?.[0]?.html).toBe(bound.html);
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
        expect(() => parseCollectionRelease({ ...document, views: [{ ...view, html }] })).toThrow();
    }
});
