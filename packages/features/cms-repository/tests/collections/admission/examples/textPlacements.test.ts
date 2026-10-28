import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../../src/exports/collections/index";
import { exampleCollection } from "./fixture";

test.each(["textarea", "setting"])(
    "rejects server text in unsupported %s positions before release admission",
    (kind) => {
        const source = exampleCollection();
        source.blocs = [source.blocs[0]];
        source.examples = [source.examples[0]];
        source.blocs[0].examples = [source.examples[0].id];
        if (kind === "textarea") {
            source.blocs[0].slots.body = { accepts: [{ kind: "native-element", accepts: ["textarea"] }] };
            source.examples[0].document.html =
                '<div cms-bloc="atlas-panel"><textarea slot="body">{{ cms.i18n.atlas.greeting }}</textarea></div>';
        } else {
            source.examples[0].document.html =
                '<div cms-bloc="atlas-panel" tone="{{ cms.i18n.atlas.greeting }}"><p slot="body">Copy</p></div>';
        }
        expect(() => parseCollectionRelease(source)).toThrow("Server texts are unsupported");
    },
);

test("validating server text placement never replaces shared references", () => {
    const source = exampleCollection();
    const before = JSON.stringify(source);
    const release = parseCollectionRelease(source);
    expect(release.examples![0].document.html).toContain("{{ cms.i18n.atlas.greeting }}");
    expect(JSON.stringify(source)).toBe(before);
});
