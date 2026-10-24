import { describe, expect, test } from "bun:test";
import { EditablePageDocument } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/document";
import type { EditorCatalogueItem } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/model";
import { heading } from "./fixtures";

describe("EditablePageDocument structure", () => {
    test("builds a recursive source tree and moves only within one slot", () => {
        const page = new EditablePageDocument(
            '<section cms-bloc="fixture-layout"><h2 cms-bloc="ulvia-official-heading" slot="content">One</h2>' +
                '<h2 cms-bloc="ulvia-official-heading" slot="content">Two</h2></section>',
        );
        const nodes = page.nodes();

        expect(nodes.map(({ depth, slot }) => ({ depth, slot }))).toEqual([
            { depth: 0, slot: "" },
            { depth: 1, slot: "content" },
            { depth: 1, slot: "content" },
        ]);
        page.move(nodes[2]!.element, -1);
        expect(page.serialize()).toContain(">Two</h2><h2");
    });

    test("accepts components only in declared component slots", () => {
        const layout: EditorCatalogueItem = {
            ...heading,
            id: "fixture-layout",
            authoringJson: JSON.stringify({
                root: { accepts: ["section"] },
                slots: { content: { accepts: [{ kind: "any-component" }], max: 1 } },
            }),
        };
        const page = new EditablePageDocument("");
        const parent = page.add(layout);
        const target = { parent, slot: "content" };

        expect(page.canInsert(heading, target, [layout, heading])).toBe(true);
        page.add(heading, target);
        expect(page.canInsert(heading, target, [layout, heading])).toBe(false);
        expect(page.insertionSlots(parent, [layout, heading])).toEqual([]);
    });

    test("restores a selected node by structural address", () => {
        const page = new EditablePageDocument(
            '<section cms-bloc="fixture-layout"><h2 cms-bloc="ulvia-official-heading" slot="content">One</h2></section>',
        );
        const selected = page.nodes()[1]!.element;
        const address = page.addressOf(selected);
        const source = page.serialize();

        page.replace(source);
        expect(page.elementAt(address)?.textContent).toBe("One");
    });

    test("preserves a required nested component and counts an unnamed default slot", () => {
        const layout: EditorCatalogueItem = {
            ...heading,
            id: "fixture-layout",
            defaultContent: '<h2 cms-bloc="ulvia-official-heading">Required</h2>',
            authoringJson: JSON.stringify({
                root: { accepts: ["section"] },
                slots: {
                    default: { accepts: [{ kind: "component", tag: heading.id }], min: 1, max: 1 },
                },
            }),
        };
        const page = new EditablePageDocument("");
        const parent = page.add(layout);
        const child = page.children(parent)[0]!;

        expect(page.insertionSlots(parent, [layout, heading])).toEqual([]);
        expect(page.canRemove(child, [layout, heading])).toBe(false);
        expect(page.remove(child, [layout, heading])).toBe(child);
        expect(page.children(parent)).toHaveLength(1);
    });

    test("counts native and component occupants against the same slot bounds", () => {
        const card: EditorCatalogueItem = {
            ...heading,
            id: "fixture-card",
            defaultContent: '<span slot="title">Native title</span>',
            authoringJson: JSON.stringify({
                root: { accepts: ["article"] },
                slots: {
                    title: {
                        accepts: [
                            { kind: "native-content", profile: "inline" },
                            { kind: "component", tag: heading.id },
                        ],
                        min: 1,
                        max: 1,
                    },
                },
            }),
        };
        const page = new EditablePageDocument("");
        const parent = page.add(card);

        expect(page.canInsert(heading, { parent, slot: "title" }, [card, heading])).toBe(false);
        parent.querySelector("span")?.remove();
        const child = page.add(heading, { parent, slot: "title" });
        expect(page.canRemove(child, [card, heading])).toBe(false);
    });
});
