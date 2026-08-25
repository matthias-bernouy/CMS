import type { Editor, EditorCatalog } from "@bernouy/cms-content/editor";

import type { EditorRuntime, EditorStructureNode, StructureNode } from "../../../../../runtime";
import type { StructureTree } from "../../../StructureTree/StructureTree";

export type StructureRenderOptions = {
    scrollStructureIntoView?: boolean;
};

export function renderStructure(
    tree: StructureTree,
    runtime: EditorRuntime | null,
    contentRoot: HTMLElement | null | undefined,
    catalog: EditorCatalog,
    _insertItems: unknown[],
    isEmptyDocumentContent: () => boolean,
    options: StructureRenderOptions = {},
): void {
    const rootNode = runtime && contentRoot ? editorRootNode(runtime, contentRoot, catalog) : null;
    if (!runtime || isEmptyDocumentContent()) {
        tree.setStructure([], null, catalog, { rootNode });
        return;
    }

    const structure = decorateStructure(runtime.getStructure());
    tree.setStructure(structure, runtime.getSelection()?.editor ?? null, catalog, {
        scrollSelectedIntoView: options.scrollStructureIntoView === true,
        repeatableTargets: repeatableTargets(structure),
        rootNode,
    });
}

function editorRootNode(
    runtime: EditorRuntime,
    contentRoot: HTMLElement,
    catalog: EditorCatalog,
): EditorStructureNode | null {
    const editor = runtime.getEditor(contentRoot);
    const entry = catalog.find((candidate) => candidate.tag.toLowerCase() === contentRoot.localName);
    if (!editor || !entry || editor.getContentSlots().length === 0) {
        return null;
    }
    return {
        kind: "editor",
        editor,
        target: contentRoot,
        tag: entry.tag,
        label: entry.label,
        icon: entry.icon,
        badges: [],
        children: decorateStructure(runtime.getStructure()),
    };
}

export function decorateStructure(nodes: StructureNode[]): StructureNode[] {
    return nodes.map((node) => decorateEditorStructureNode(node));
}

export function findStructureNodeLabel(runtime: EditorRuntime | null, editor: Editor): string | null {
    const visit = (nodes: StructureNode[]): string | null => {
        for (const node of nodes) {
            if (node.editor === editor) {
                return node.label;
            }
            const childLabel = visit(node.children);
            if (childLabel) {
                return childLabel;
            }
        }
        return null;
    };

    return runtime ? visit(runtime.getStructure()) : null;
}

function decorateEditorStructure(nodes: EditorStructureNode[]): EditorStructureNode[] {
    return nodes.map((node) => decorateEditorStructureNode(node));
}

function decorateEditorStructureNode(node: EditorStructureNode): EditorStructureNode {
    return {
        ...node,
        children: decorateStructure(node.children),
    };
}

function repeatableTargets(nodes: StructureNode[]): HTMLElement[] {
    return flattenStructure(nodes).map((node) => node.target);
}

function flattenStructure(nodes: StructureNode[]): StructureNode[] {
    return nodes.flatMap((node) => [node, ...flattenStructure(node.children)]);
}
