import type { EditorCatalog } from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../../BlockPickerModal/BlockPickerModal";
import type { DefaultTemplateSelection, StructureTree } from "../../StructureTree/StructureTree";

export function isStructureTree(value: Element | null | undefined): value is StructureTree {
    return Boolean(value && "catalog" in value && "setStructure" in value && "setInsertItems" in value && "setDefaultTemplateSelection" in value);
}

export function syncStructureTreeCatalog(
    root: ShadowRoot,
    catalog: EditorCatalog,
    insertItems: BlockPickerItem[],
    defaultTemplateSelection: DefaultTemplateSelection,
): void {
    withStructureTree(root, tree => {
        tree.catalog = catalog;
        tree.setInsertItems(insertItems);
        tree.setDefaultTemplateSelection(defaultTemplateSelection);
    });
}

export function syncStructureTreeInsertItems(
    root: ShadowRoot,
    insertItems: BlockPickerItem[],
    defaultTemplateSelection: DefaultTemplateSelection,
): void {
    withStructureTree(root, tree => {
        tree.setInsertItems(insertItems);
        tree.setDefaultTemplateSelection(defaultTemplateSelection);
    });
}

export function syncStructureTreeDefaultTemplateSelection(
    root: ShadowRoot,
    defaultTemplateSelection: DefaultTemplateSelection,
): void {
    withStructureTree(root, tree => {
        tree.setDefaultTemplateSelection(defaultTemplateSelection);
    });
}

function withStructureTree(root: ShadowRoot, apply: (tree: StructureTree) => void): void {
    const tree = root.querySelector("cms-editor-v2-structure-tree");
    if (isStructureTree(tree)) {
        apply(tree);
        return;
    }

    customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
        const upgradedTree = root.querySelector("cms-editor-v2-structure-tree");
        if (isStructureTree(upgradedTree)) apply(upgradedTree);
    });
}
