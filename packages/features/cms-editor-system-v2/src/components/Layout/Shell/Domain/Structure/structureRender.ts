import {
    CMS_SNIPPET_TAG,
    type DataField,
    type DataScope,
    type Editor,
    type EditorCatalog,
} from "@bernouy/cms-content/editor";

import type {
    EditorRuntime,
    EditorStructureNode,
    StructureNode,
} from "../../../../../runtime";
import type { BlockPickerItem } from "../../../BlockPickerModal/BlockPickerModal";
import type { StructureTree } from "../../../StructureTree/StructureTree";

export type StructureRenderOptions = {
    scrollStructureIntoView?: boolean;
};

export function renderStructure(
    tree: StructureTree,
    runtime: EditorRuntime | null,
    catalog: EditorCatalog,
    insertItems: BlockPickerItem[],
    isEmptyDocumentContent: () => boolean,
    options: StructureRenderOptions = {},
): void {
    if (!runtime || isEmptyDocumentContent()) {
        tree.setStructure([], null, catalog);
        return;
    }

    const structure = decorateStructure(runtime.getStructure(), insertItems);
    tree.setStructure(
        structure,
        runtime.getSelection()?.editor ?? null,
        catalog,
        {
            scrollSelectedIntoView: options.scrollStructureIntoView === true,
            repeatableTargets:      repeatableTargets(runtime, structure),
        },
    );
}

export function decorateStructure(nodes: StructureNode[], insertItems: BlockPickerItem[]): StructureNode[] {
    return nodes.map(node => decorateEditorStructureNode(node, insertItems));
}

export function findStructureNodeLabel(runtime: EditorRuntime | null, editor: Editor): string | null {
    const visit = (nodes: StructureNode[]): string | null => {
        for (const node of nodes) {
            if (node.editor === editor) return node.label;
            const childLabel = visit(node.children);
            if (childLabel) return childLabel;
        }
        return null;
    };

    return runtime ? visit(runtime.getStructure()) : null;
}

function decorateEditorStructure(nodes: EditorStructureNode[], insertItems: BlockPickerItem[]): EditorStructureNode[] {
    return nodes.map(node => decorateEditorStructureNode(node, insertItems));
}

function decorateEditorStructureNode(node: EditorStructureNode, insertItems: BlockPickerItem[]): EditorStructureNode {
    const snippet = snippetStructureDetails(node, insertItems);

    return {
        ...node,
        label:    snippet?.label ?? node.label,
        icon:     snippet?.icon ?? node.icon,
        children: decorateStructure(node.children, insertItems),
    };
}

function snippetStructureDetails(
    node: EditorStructureNode,
    insertItems: BlockPickerItem[],
): { label: string; icon: string } | null {
    if (node.tag.toLowerCase() !== CMS_SNIPPET_TAG) return null;

    const identifier = node.target.getAttribute("identifier")?.trim() ?? "";
    const item = insertItems.find((candidate): candidate is Extract<BlockPickerItem, { kind: "snippet" }> =>
        candidate.kind === "snippet" && candidate.identifier === identifier);

    return {
        label: item?.label || identifier || node.label,
        icon:  item?.icon || "S",
    };
}

function repeatableTargets(runtime: EditorRuntime, nodes: StructureNode[]): HTMLElement[] {
    return flattenStructure(nodes)
        .filter(node => hasArrayFields(runtime.registry.collectDataScopes(node.target)))
        .map(node => node.target);
}

function hasArrayFields(scopes: DataScope[]): boolean {
    return scopes.some(scope => fieldsContainArray(scope.fields));
}

function fieldsContainArray(fields: DataField[]): boolean {
    return fields.some(field => field.type === "array" || fieldsContainArray(field.children ?? []));
}

function flattenStructure(nodes: StructureNode[]): StructureNode[] {
    return nodes.flatMap(node => [node, ...flattenStructure(node.children)]);
}
