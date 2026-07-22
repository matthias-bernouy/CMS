import { describe, expect, test } from "bun:test";
import { Editor } from "@bernouy/cms-content/editor";
import {
    clearStructureDragState,
    clearStructureDropRow,
    onStructureDragOver,
    onStructureDragStart,
    onStructureDrop,
    structureDropPosition,
    type StructureDragDropContext,
    type StructureDragDropState,
} from "../../src/components/Layout/StructureTree/Actions/structureDragDrop";
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

function rowAt(top = 10, height = 20): HTMLElement {
    const row = document.createElement("div");
    row.getBoundingClientRect = () => ({ top, height }) as DOMRect;
    return row;
}

function dragEvent(currentTarget: HTMLElement, clientY: number) {
    let prevented = false;
    const data = new Map<string, string>();
    const transfer = {
        effectAllowed: "none",
        dropEffect: "none",
        setData: (type: string, value: string) => data.set(type, value),
    };
    const event = {
        clientY,
        currentTarget,
        dataTransfer: transfer,
        preventDefault: () => {
            prevented = true;
        },
    } as unknown as DragEvent;
    return { event, transfer, data, wasPrevented: () => prevented };
}

function dragContext(state: StructureDragDropState) {
    const moves: Array<["move-before" | "move-after", EditorStructureNode, EditorStructureNode]> = [];
    let descendant: EditorStructureNode | null = null;
    const context: StructureDragDropContext = {
        clearDropRow: () => clearStructureDropRow(state),
        emitMove: (action, target, dragged) => moves.push([action, target, dragged]),
        isDescendantNode: (candidate) => candidate === descendant,
    };
    return { context, moves, setDescendant: (node: EditorStructureNode | null) => (descendant = node) };
}

describe("structure drag and drop", () => {
    test("starts a drag and marks the upper half of a valid target", () => {
        const dragged = structureNode("Dragged");
        const target = structureNode("Target");
        const state: StructureDragDropState = { draggedNode: null, dropRow: null };
        const row = rowAt();
        const start = dragEvent(row, 0);
        const over = dragEvent(row, 12);
        const { context } = dragContext(state);

        onStructureDragStart(state, dragged, start.event);
        onStructureDragOver(state, target, row, over.event, context);

        expect(state.draggedNode).toBe(dragged);
        expect(start.data.get("text/plain")).toBe("Dragged");
        expect(start.transfer.effectAllowed).toBe("move");
        expect(over.wasPrevented()).toBe(true);
        expect(over.transfer.dropEffect).toBe("move");
        expect(row.classList.contains("drop-before")).toBe(true);
        expect(state.dropRow).toBe(row);
    });

    test("emits an after move and clears the complete drag state", () => {
        const dragged = structureNode("Dragged");
        const target = structureNode("Target");
        const state: StructureDragDropState = { draggedNode: dragged, dropRow: null };
        const row = rowAt();
        const over = dragEvent(row, 25);
        const drop = dragEvent(row, 25);
        const { context, moves } = dragContext(state);

        onStructureDragOver(state, target, row, over.event, context);
        onStructureDrop(state, target, drop.event, context);

        expect(moves).toEqual([["move-after", target, dragged]]);
        expect(drop.wasPrevented()).toBe(true);
        expect(state).toEqual({ draggedNode: null, dropRow: null });
        expect(row.classList.contains("drop-after")).toBe(false);
    });

    test("rejects self and descendant targets without consuming the event", () => {
        const dragged = structureNode("Dragged");
        const descendant = structureNode("Descendant");
        const state: StructureDragDropState = { draggedNode: dragged, dropRow: null };
        const row = rowAt();
        const selfEvent = dragEvent(row, 12);
        const descendantEvent = dragEvent(row, 12);
        const { context, moves, setDescendant } = dragContext(state);

        onStructureDragOver(state, dragged, row, selfEvent.event, context);
        setDescendant(descendant);
        onStructureDrop(state, descendant, descendantEvent.event, context);

        expect(selfEvent.wasPrevented()).toBe(false);
        expect(descendantEvent.wasPrevented()).toBe(false);
        expect(moves).toEqual([]);
        expect(structureDropPosition(row, dragEvent(row, 20).event)).toBe("after");

        clearStructureDragState(state);
        clearStructureDropRow(state);
        expect(state).toEqual({ draggedNode: null, dropRow: null });
    });
});
