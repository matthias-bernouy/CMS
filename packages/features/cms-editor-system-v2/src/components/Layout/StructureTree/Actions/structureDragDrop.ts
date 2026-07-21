import type { EditorStructureNode } from "../../../../runtime";

export type StructureDragDropState = {
    draggedNode: EditorStructureNode | null;
    dropRow: HTMLElement | null;
};

export type StructureDragDropContext = {
    clearDropRow(): void;
    emitMove(action: "move-before" | "move-after", target: EditorStructureNode, dragged: EditorStructureNode): void;
    isDescendantNode(candidate: EditorStructureNode, parent: EditorStructureNode): boolean;
};

export function onStructureDragStart(state: StructureDragDropState, node: EditorStructureNode, event: DragEvent): void {
    state.draggedNode = node;
    event.dataTransfer?.setData("text/plain", node.label);
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
    }
}

export function onStructureDragOver(
    state: StructureDragDropState,
    node: EditorStructureNode,
    row: HTMLElement,
    event: DragEvent,
    context: StructureDragDropContext,
): void {
    if (!canDropOnNode(state, node, context)) {
        return;
    }
    event.preventDefault();
    context.clearDropRow();
    const position = structureDropPosition(row, event);
    row.classList.add(position === "before" ? "drop-before" : "drop-after");
    state.dropRow = row;
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }
}

export function onStructureDrop(
    state: StructureDragDropState,
    node: EditorStructureNode,
    event: DragEvent,
    context: StructureDragDropContext,
): void {
    if (!canDropOnNode(state, node, context)) {
        return;
    }
    event.preventDefault();
    const position = structureDropPosition(event.currentTarget as HTMLElement, event);
    context.emitMove(position === "before" ? "move-before" : "move-after", node, state.draggedNode!);
    clearStructureDragState(state);
}

export function structureDropPosition(target: HTMLElement, event: DragEvent): "before" | "after" {
    const rect = target.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

export function clearStructureDragState(state: StructureDragDropState): void {
    state.draggedNode = null;
    clearStructureDropRow(state);
}

export function clearStructureDropRow(state: StructureDragDropState): void {
    state.dropRow?.classList.remove("drop-before", "drop-after");
    state.dropRow = null;
}

function canDropOnNode(
    state: StructureDragDropState,
    node: EditorStructureNode,
    context: StructureDragDropContext,
): state is { draggedNode: EditorStructureNode; dropRow: HTMLElement | null } {
    return Boolean(
        state.draggedNode && state.draggedNode !== node && !context.isDescendantNode(node, state.draggedNode),
    );
}
