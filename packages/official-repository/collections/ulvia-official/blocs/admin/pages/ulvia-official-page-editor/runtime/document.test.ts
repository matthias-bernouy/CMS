import { describe, expect, test } from "bun:test";
import { EditablePageDocument } from "./document";
import type { EditorCatalogueItem } from "./model";

const heading: EditorCatalogueItem = {
    id: "ulvia-official-heading",
    name: "Heading",
    group: "Content",
    description: "",
    kind: "component",
    ownership: "code-managed",
    order: 0,
    defaultContent: "Heading",
    authoringJson: JSON.stringify({
        root: { accepts: ["h2", "h1", "h3"] },
        slots: { "": { accepts: [{ kind: "native-content", profile: "phrasing" }] } },
    }),
};

describe("EditablePageDocument", () => {
    test("edits the semantic Bloc root without introducing a wrapper", () => {
        const page = new EditablePageDocument("");
        const index = page.add(heading);

        expect(page.editableContent(index, heading)).toBe("Heading");
        page.updateContent(index, "Updated", heading);

        expect(page.serialize()).toBe('<h2 cms-bloc="ulvia-official-heading">Updated</h2>');
    });

    test("creates a declared native child when a wrapper has no default content", () => {
        const page = new EditablePageDocument("");
        const field: EditorCatalogueItem = {
            ...heading,
            id: "ulvia-official-field",
            defaultContent: "",
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: {
                    "": {
                        accepts: [
                            {
                                kind: "native-element",
                                accepts: ["input"],
                                defaults: { type: "text", name: "field" },
                            },
                        ],
                    },
                },
            }),
        };
        const index = page.add(field);

        expect(page.serialize()).toBe('<div cms-bloc="ulvia-official-field"><input type="text" name="field"></div>');
    });
});
