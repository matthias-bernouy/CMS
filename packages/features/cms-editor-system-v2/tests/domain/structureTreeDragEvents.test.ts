import { describe, expect, test } from "bun:test";
import { Editor } from "@bernouy/cms-content/editor";
import {
    clearStructureTreeDrag,
    clearStructureTreeDropRow,
    dropStructureTreeDrag,
    overStructureTreeDrag,
    startStructureTreeDrag,
} from "../../src/components/Layout/StructureTree/State/Controllers/Support/structureTreeDragEvents";
import type { StructureTreeController } from "../../src/components/Layout/StructureTree/State/Controllers/structureTreeController";
import type { EditorStructureNode } from "../../src/runtime";

function structureNode(label: string): EditorStructureNode {
    const target = document.createElement("article");
    return {
        kind: "editor",
        editor: new Editor(target),
        target,
        tag: "article",
        label,
        badges: [],
        children: [],
    };
}

function dragEvent(currentTarget: HTMLElement, clientY: number): DragEvent {
    return {
        clientY,
        currentTarget,
        dataTransfer: {
            effectAllowed: "none",
            dropEffect: "none",
            setData: () => undefined,
        },
        preventDefault: () => undefined,
    } as unknown as DragEvent;
}

describe("structure tree drag adapters", () => {
    test("maps tree drag events to editor move actions", () => {
        const dragged = structureNode("Dragged");
        const target = structureNode("Target");
        const row = document.createElement("div");
        row.getBoundingClientRect = () => ({ top: 0, height: 20 }) as DOMRect;
        const actions: unknown[][] = [];
        const tree = {
            state: { dragDrop: { draggedNode: null, dropRow: null } },
            emitter: { emitAction: (...args: unknown[]) => actions.push(args) },
            nodes: { isDescendantNode: () => false },
        } as unknown as StructureTreeController;

        startStructureTreeDrag(tree, dragged, dragEvent(row, 0));
        overStructureTreeDrag(tree, target, row, dragEvent(row, 15));
        dropStructureTreeDrag(tree, target, dragEvent(row, 15));

        expect(actions).toHaveLength(1);
        expect(actions[0]?.[0]).toBe("move-after");
        expect(actions[0]?.[1]).toBe(target.editor);
        expect(actions[0]?.[5]).toBe(dragged.editor);
        expect(tree.state.dragDrop).toEqual({ draggedNode: null, dropRow: null });
    });

    test("clears row presentation independently or with the drag", () => {
        const row = document.createElement("div");
        row.classList.add("drop-before");
        const dragged = structureNode("Dragged");
        const tree = {
            state: { dragDrop: { draggedNode: dragged, dropRow: row } },
        } as unknown as StructureTreeController;

        clearStructureTreeDropRow(tree);

        expect(tree.state.dragDrop.draggedNode).toBe(dragged);
        expect(tree.state.dragDrop.dropRow).toBeNull();
        expect(row.classList.contains("drop-before")).toBe(false);

        tree.state.dragDrop.dropRow = row;
        clearStructureTreeDrag(tree);
        expect(tree.state.dragDrop).toEqual({ draggedNode: null, dropRow: null });
    });
});
