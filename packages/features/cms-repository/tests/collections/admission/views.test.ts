import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../src/exports/collections";
import { collectionDocument } from "../fixtures";

test("collection views keep Control HTML while rejecting executable markup", () => {
    const document = collectionDocument();
    const view = {
        id: "overview",
        name: "Overview",
        icon: "star",
        html: "<section><h2>{{ dashboard.name }}</h2><atlas-panel></atlas-panel></section>",
    };
    const release = parseCollectionRelease({ ...document, views: [view] });
    expect(release.views?.[0]?.html).toBe(view.html);
    expect(release.views?.[0]?.icon).toBe("star");
    for (const html of [
        "<script>alert(1)</script>",
        '<a href="https://example.com">Leave</a>',
        '<div style="color:red">Inline style</div>',
        '<div onclick="run()">Handler</div>',
        "<atlas-unknown></atlas-unknown>",
    ]) {
        expect(() => parseCollectionRelease({ ...document, views: [{ ...view, html }] })).toThrow();
    }
});
