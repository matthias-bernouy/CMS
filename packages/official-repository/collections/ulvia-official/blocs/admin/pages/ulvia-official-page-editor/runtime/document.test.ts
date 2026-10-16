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
    defaultContent: "<h2>Heading</h2>",
    authoringJson: JSON.stringify({
        root: { accepts: ["div"] },
        content: { accepts: ["h1", "h2", "h3"] },
    }),
};

describe("EditablePageDocument", () => {
    test("edits the Page-owned native child without removing its semantic element", () => {
        const page = new EditablePageDocument("");
        const index = page.add(heading);

        expect(page.editableContent(index, heading)).toBe("Heading");
        page.updateContent(index, "Updated", heading);

        expect(page.serialize()).toBe('<div cms-bloc="ulvia-official-heading"><h2>Updated</h2></div>');
    });

    test("creates a declared native child when a wrapper has no default content", () => {
        const page = new EditablePageDocument("");
        const index = page.add({ ...heading, defaultContent: "" });
        page.updateContent(index, "Created", heading);

        expect(page.serialize()).toBe('<div cms-bloc="ulvia-official-heading"><h1>Created</h1></div>');
    });
});
