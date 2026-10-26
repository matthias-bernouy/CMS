import { createBlocElement } from "./factory";
import { describe, expect, test } from "bun:test";
import type { EditorCatalogueItem } from "../model";
import { contentFields } from "./content";

const heading: EditorCatalogueItem = {
    id: "ulvia-official-heading",
    name: "Heading",
    group: "Content",
    description: "",
    kind: "component",
    ownership: "code-managed",
    order: 0,
    defaultContent: "",
    authoringJson: JSON.stringify({
        slots: {
            default: { accepts: [{ kind: "native-content", profile: "phrasing" }], min: 1 },
            accent: { accepts: [{ kind: "native-content", profile: "phrasing" }], max: 1 },
        },
    }),
};

describe("editor content fields", () => {
    test("keeps named native content out of the default slot", () => {
        const element = document.createElement("h1");
        element.innerHTML = 'Main heading<span slot="accent">Accent heading</span>';

        expect(contentFields(element, heading).map(({ label, slot, value }) => ({ label, slot, value }))).toEqual([
            { label: "Content", slot: "", value: "Main heading" },
            { label: "Accent", slot: "accent", value: "Accent heading" },
        ]);
    });
});

test("insertion copies a full example root and preserves its chosen tag, settings and editable text", () => {
    const item: EditorCatalogueItem = {
        ...heading,
        authoringJson: JSON.stringify({
            root: { accepts: ["h1", "h2"] },
            initialDocument: { html: '<h2 cms-bloc="ulvia-official-heading" size="lg">Example title</h2>' },
        }),
    };
    const first = createBlocElement(item);
    expect(first.localName).toBe("h2");
    expect(first.getAttribute("size")).toBe("lg");
    expect(first.textContent).toBe("Example title");
    first.textContent = "Site-owned title";
    expect(createBlocElement(item).textContent).toBe("Example title");
});

test("insertion rejects an example owned by another Bloc", () => {
    const item: EditorCatalogueItem = {
        ...heading,
        authoringJson: JSON.stringify({ initialDocument: { html: '<div cms-bloc="other-bloc"></div>' } }),
    };
    expect(() => createBlocElement(item)).toThrow("invalid initial document");
});
