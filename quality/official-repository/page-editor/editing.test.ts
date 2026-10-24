import { describe, expect, test } from "bun:test";
import { PageEditingState } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/controller/editing";
import type { EditorCatalogueItem } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/model";
import { heading } from "./fixtures";

describe("PageEditingState", () => {
    test("restores content and selection through undo and redo", () => {
        const editing = new PageEditingState();
        editing.initialize('<h2 cms-bloc="ulvia-official-heading">Original</h2>');

        const selected = editing.updateContent("", "Updated");

        expect(selected?.textContent).toBe("Updated");
        expect(editing.history.canUndo).toBe(true);
        expect(editing.undo()).toBe(true);
        expect(editing.selected?.textContent).toBe("Original");
        expect(editing.redo()).toBe(true);
        expect(editing.selected?.textContent).toBe("Updated");
    });

    test("does not record rejected or ineffective structural changes", () => {
        const layout = requiredLayout();
        const editing = new PageEditingState();
        editing.initialize(
            '<section cms-bloc="fixture-layout"><h2 cms-bloc="ulvia-official-heading">Required</h2></section>',
        );
        editing.select("0.0");

        expect(editing.remove([layout, heading])).toBe(false);
        expect(editing.move(-1)).toBe(false);
        expect(editing.history.canUndo).toBe(false);
    });

    test("adds to a declared nested slot and restores the parent selection after undo", () => {
        const layout = requiredLayout(2, 0);
        const editing = new PageEditingState();
        editing.initialize('<section cms-bloc="fixture-layout"></section>');

        expect(editing.setInsertionTarget("0", "")).toBe(true);
        expect(editing.add(heading, [layout, heading])).toBe(true);
        expect(editing.selected?.getAttribute("cms-bloc")).toBe(heading.id);
        expect(editing.document.nodes()).toHaveLength(2);
        expect(editing.undo()).toBe(true);
        expect(editing.document.nodes()).toHaveLength(1);
        expect(editing.selected?.getAttribute("cms-bloc")).toBe(layout.id);
    });

    test("changes a root only to a tag admitted by the Bloc contract", () => {
        const action: EditorCatalogueItem = {
            ...heading,
            id: "ulvia-official-action",
            defaultContent: "Action",
            authoringJson: JSON.stringify({ root: { accepts: ["button", "a"] } }),
        };
        const editing = new PageEditingState();
        editing.initialize('<button cms-bloc="ulvia-official-action">Action</button>');

        expect(editing.updateRootTag("div", action)).toBeNull();
        expect(editing.updateRootTag("a", action)?.localName).toBe("a");
        expect(editing.document.serialize()).toBe('<a cms-bloc="ulvia-official-action">Action</a>');
        expect(editing.undo()).toBe(true);
        expect(editing.document.serialize()).toBe('<button cms-bloc="ulvia-official-action">Action</button>');
    });

    test("records native child attribute edits in history", () => {
        const editing = new PageEditingState();
        editing.initialize('<div cms-bloc="ulvia-official-input"><input type="text" name="field"></div>');

        editing.updateNativeAttribute("", "name", "fullName");

        expect(editing.document.serialize()).toContain('name="fullName"');
        expect(editing.undo()).toBe(true);
        expect(editing.document.serialize()).toContain('name="field"');
    });
});

function requiredLayout(max = 1, min = 1): EditorCatalogueItem {
    return {
        ...heading,
        id: "fixture-layout",
        authoringJson: JSON.stringify({
            root: { accepts: ["section"] },
            slots: {
                default: {
                    accepts: [{ kind: "component", tag: heading.id }],
                    min,
                    max,
                },
            },
        }),
    };
}
