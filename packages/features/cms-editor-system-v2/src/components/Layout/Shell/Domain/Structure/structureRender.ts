import type { DataField, DataScope, Editor, EditorCatalog } from "@bernouy/cms-content/editor";

import type { EditorRuntime, EditorStructureNode, StructureNode } from "../../../../../runtime";
import type { StructureTree } from "../../../StructureTree/StructureTree";

export type StructureRenderOptions = {
    scrollStructureIntoView?: boolean;
};

export function renderStructure(
    tree: StructureTree,
    runtime: EditorRuntime | null,
    catalog: EditorCatalog,
    _insertItems: unknown[],
    isEmptyDocumentContent: () => boolean,
    options: StructureRenderOptions = {},
): void {
    if (!runtime || isEmptyDocumentContent()) {
        tree.setStructure([], null, catalog);
        return;
    }

    const structure = decorateStructure(runtime.getStructure());
    tree.setStructure(structure, runtime.getSelection()?.editor ?? null, catalog, {
        scrollSelectedIntoView: options.scrollStructureIntoView === true,
        repeatableTargets: repeatableTargets(runtime, structure),
    });
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

function repeatableTargets(runtime: EditorRuntime, nodes: StructureNode[]): HTMLElement[] {
    return flattenStructure(nodes)
        .filter((node) => hasArrayFields(runtime.registry.collectDataScopes(node.target)))
        .map((node) => node.target);
}

function hasArrayFields(scopes: DataScope[]): boolean {
    return scopes.some((scope) => fieldsContainArray(scope.fields));
}

function fieldsContainArray(fields: DataField[]): boolean {
    return fields.some((field) => field.type === "array" || fieldsContainArray(field.children ?? []));
}

function flattenStructure(nodes: StructureNode[]): StructureNode[] {
    return nodes.flatMap((node) => [node, ...flattenStructure(node.children)]);
}
