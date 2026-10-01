import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../src/exports/collections";
import { collectionDocument } from "../fixtures";

test("collection views keep Control HTML while rejecting executable markup", () => {
    const document = collectionDocument();
    const view = {
        id: "overview",
        name: "Overview",
        html: "<section><h2>{{ dashboard.name }}</h2><atlas-panel></atlas-panel></section>",
    };
    const release = parseCollectionRelease({ ...document, views: [view] });
    expect(release.views?.[0]?.html).toBe(view.html);
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
