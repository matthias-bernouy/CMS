import type { EditorStructureNode } from "../../../../../../runtime";
import {
    clearStructureDragState,
    clearStructureDropRow,
    onStructureDragOver,
    onStructureDragStart,
    onStructureDrop,
} from "../../../Actions/structureDragDrop";
import type { StructureTreeController } from "../structureTreeController";

export function startStructureTreeDrag(
    tree: StructureTreeController,
    node: EditorStructureNode,
    event: DragEvent,
): void {
    onStructureDragStart(tree.state.dragDrop, node, event);
}

export function overStructureTreeDrag(
    tree: StructureTreeController,
    node: EditorStructureNode,
    row: HTMLElement,
    event: DragEvent,
): void {
    onStructureDragOver(tree.state.dragDrop, node, row, event, dragDropContext(tree));
}

export function dropStructureTreeDrag(
    tree: StructureTreeController,
    node: EditorStructureNode,
    event: DragEvent,
): void {
    onStructureDrop(tree.state.dragDrop, node, event, dragDropContext(tree));
}

export function clearStructureTreeDrag(tree: StructureTreeController): void {
    clearStructureDragState(tree.state.dragDrop);
}

export function clearStructureTreeDropRow(tree: StructureTreeController): void {
    clearStructureDropRow(tree.state.dragDrop);
}

function dragDropContext(tree: StructureTreeController) {
    return {
        clearDropRow: () => clearStructureTreeDropRow(tree),
        emitMove: (action: "move-before" | "move-after", target: EditorStructureNode, dragged: EditorStructureNode) => {
            tree.emitter.emitAction(action, target.editor, undefined, undefined, undefined, dragged.editor);
        },
        isDescendantNode: (candidate: EditorStructureNode, parent: EditorStructureNode) =>
            tree.nodes.isDescendantNode(candidate, parent),
    };
}
