import type { Editor } from "@bernouy/cms-content/editor";
import type {
    EditorStructureNode,
    SourceStateStructureNode,
    StructureNode,
} from "../../../../runtime";

type SourceStatePredicate = (node: StructureNode) => node is SourceStateStructureNode;

export function visibleStructureNodes(
    nodes: StructureNode[],
    isCollapsed: (node: StructureNode) => boolean,
    depth = 0,
): { item: StructureNode; depth: number }[] {
    return nodes.flatMap(node => {
        const current = [{ item: node, depth }];
        if (isCollapsed(node)) return current;
        return [
            ...current,
            ...visibleStructureNodes(node.children, isCollapsed, depth + 1),
        ];
    });
}

export function pathToEditor(
    nodes: StructureNode[],
    editor: Editor,
    isSourceStateNode: SourceStatePredicate,
    ancestors: StructureNode[] = [],
): StructureNode[] | null {
    for (const node of nodes) {
        const path = [...ancestors, node];
        if (!isSourceStateNode(node) && node.editor === editor) return path;

        const childPath = pathToEditor(node.children, editor, isSourceStateNode, path);
        if (childPath) return childPath;
    }

    return null;
}

export function flattenStructureNodes(nodes: StructureNode[]): StructureNode[] {
    return nodes.flatMap(node => [
        node,
        ...flattenStructureNodes(node.children),
    ]);
}

export function editorChildrenOf(
    parent: EditorStructureNode,
    isSourceStateNode: SourceStatePredicate,
): EditorStructureNode[] {
    return parent.children.flatMap(child => isSourceStateNode(child) ? child.children : [child]);
}

export function isDescendantStructureNode(
    candidate: EditorStructureNode,
    parent: EditorStructureNode,
    isSourceStateNode: SourceStatePredicate,
): boolean {
    return parent.children.some(child => {
        if (isSourceStateNode(child)) {
            return child.children.some(grandChild => grandChild === candidate || isDescendantStructureNode(candidate, grandChild, isSourceStateNode));
        }
        return child === candidate || isDescendantStructureNode(candidate, child, isSourceStateNode);
    });
}
