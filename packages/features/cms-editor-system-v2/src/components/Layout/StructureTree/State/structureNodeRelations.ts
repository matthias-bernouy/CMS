import type {
    ContentSlot,
    Editor,
} from "@bernouy/cms-content/editor";
import type {
    EditorStructureNode,
    StructureNode,
} from "../../../../runtime";

export function canDuplicateNode(
    node: EditorStructureNode,
    parentNode: (child: EditorStructureNode) => EditorStructureNode | null,
    slotForChild: (parent: EditorStructureNode, child: EditorStructureNode) => ContentSlot | undefined,
    slotChildCount: (parent: EditorStructureNode, slot: ContentSlot) => number,
): boolean {
    const parent = parentNode(node);
    if (!parent) return true;

    const slot = slotForChild(parent, node);
    if (!slot?.max) return true;

    return slotChildCount(parent, slot) < slot.max;
}

export function canDeleteNode(
    node: EditorStructureNode,
    parentNode: (child: EditorStructureNode) => EditorStructureNode | null,
    slotForChild: (parent: EditorStructureNode, child: EditorStructureNode) => ContentSlot | undefined,
    slotChildCount: (parent: EditorStructureNode, slot: ContentSlot) => number,
): boolean {
    const parent = parentNode(node);
    if (!parent) return true;

    const slot = slotForChild(parent, node);
    if (!slot?.min) return true;

    return slotChildCount(parent, slot) > slot.min;
}

export function slotForChild(parent: EditorStructureNode, child: EditorStructureNode): ContentSlot | undefined {
    const childSlot = child.target.getAttribute("slot") ?? undefined;
    return parent.editor.getContentSlots().find(slot => (slot.slot ?? undefined) === childSlot);
}

export function sameSlot(left: ContentSlot, right: ContentSlot): boolean {
    return (left.slot ?? undefined) === (right.slot ?? undefined);
}

export function slotChildCount(
    parent: EditorStructureNode,
    slot: ContentSlot,
    editorChildrenOf: (parent: EditorStructureNode) => EditorStructureNode[],
): number {
    return editorChildrenOf(parent)
        .filter(child => (child.target.getAttribute("slot") ?? undefined) === (slot.slot ?? undefined))
        .length;
}

export function parentStructureNode(
    nodes: StructureNode[],
    child: EditorStructureNode,
): EditorStructureNode | null {
    for (const node of nodes) {
        if (node.children.includes(child)) return node;
        const parent = parentStructureNode(node.children, child);
        if (parent) return parent;
    }
    return null;
}

export function nodeForEditor(
    nodes: StructureNode[],
    editor: Editor,
): EditorStructureNode | null {
    return nodes
        .flatMap(node => [node, ...nodeForEditorChildren(node)])
        .find(node => node.editor === editor) ?? null;
}

function nodeForEditorChildren(node: StructureNode): StructureNode[] {
    return node.children.flatMap(child => [child, ...nodeForEditorChildren(child)]);
}
