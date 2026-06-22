import type {
    ContentSlot,
    Editor,
} from "@bernouy/cms-content/editor";
import type {
    EditorStructureNode,
    SourceStateName,
    SourceStateStructureNode,
    StructureNode,
} from "../../../../runtime";

type SourceStatePredicate = (node: StructureNode) => node is SourceStateStructureNode;

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
    isSourceStateNode: SourceStatePredicate,
    nodeForEditor: (editor: Editor) => EditorStructureNode | null,
): EditorStructureNode | null {
    for (const node of nodes) {
        if (isSourceStateNode(node)) {
            if (node.children.includes(child)) return nodeForEditor(node.sourceEditor);
            const stateParent = parentStructureNode(node.children, child, isSourceStateNode, nodeForEditor);
            if (stateParent) return stateParent;
            continue;
        }
        if (node.children.includes(child)) return node;
        const parent = parentStructureNode(node.children, child, isSourceStateNode, nodeForEditor);
        if (parent) return parent;
    }
    return null;
}

export function nodeForEditor(
    nodes: StructureNode[],
    editor: Editor,
    isSourceStateNode: SourceStatePredicate,
): EditorStructureNode | null {
    return nodes
        .flatMap(node => [node, ...nodeForEditorChildren(node)])
        .filter((node): node is EditorStructureNode => !isSourceStateNode(node))
        .find(node => node.editor === editor) ?? null;
}

export function sourceStateKey(
    keys: WeakMap<HTMLElement, Map<SourceStateName, object>>,
    node: SourceStateStructureNode,
): object {
    let sourceKeys = keys.get(node.sourceEditor.target);
    if (!sourceKeys) {
        sourceKeys = new Map();
        keys.set(node.sourceEditor.target, sourceKeys);
    }

    let key = sourceKeys.get(node.state);
    if (!key) {
        key = {};
        sourceKeys.set(node.state, key);
    }

    return key;
}

function nodeForEditorChildren(node: StructureNode): StructureNode[] {
    return node.children.flatMap(child => [child, ...nodeForEditorChildren(child)]);
}
