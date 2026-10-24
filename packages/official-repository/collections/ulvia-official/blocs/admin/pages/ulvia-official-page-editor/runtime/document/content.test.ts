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
