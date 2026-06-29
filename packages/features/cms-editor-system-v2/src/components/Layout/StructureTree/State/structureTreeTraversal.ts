import type { Editor } from "@bernouy/cms-content/editor";
import type {
    EditorStructureNode,
    StructureNode,
} from "../../../../runtime";

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
    ancestors: StructureNode[] = [],
): StructureNode[] | null {
    for (const node of nodes) {
        const path = [...ancestors, node];
        if (node.editor === editor) return path;

        const childPath = pathToEditor(node.children, editor, path);
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
): EditorStructureNode[] {
    return parent.children;
}

export function isDescendantStructureNode(
    candidate: EditorStructureNode,
    parent: EditorStructureNode,
): boolean {
    return parent.children.some(child => {
        return child === candidate || isDescendantStructureNode(candidate, child);
    });
}
