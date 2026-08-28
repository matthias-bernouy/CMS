import type { EditorCatalog } from "@bernouy/cms-content/editor";
import type { StructureTree } from "../../StructureTree/StructureTree";
import type { ResolvedEditorInteractionPolicy } from "../../../../policy/editorInteractionPolicy";

export function isStructureTree(value: Element | null | undefined): value is StructureTree {
    return Boolean(value && "catalog" in value && "setStructure" in value && "setEditingPolicy" in value);
}

export function syncStructureTreeEditingPolicy(root: ShadowRoot, policy: ResolvedEditorInteractionPolicy): void {
    withStructureTree(root, (tree) => tree.setEditingPolicy(policy));
}

export function syncStructureTreeCatalog(root: ShadowRoot, catalog: EditorCatalog): void {
    withStructureTree(root, (tree) => {
        tree.catalog = catalog;
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
        if (isStructureTree(upgradedTree)) {
            apply(upgradedTree);
        }
    });
}
