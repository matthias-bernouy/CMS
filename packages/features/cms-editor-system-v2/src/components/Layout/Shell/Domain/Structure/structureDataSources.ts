import type { EditorDataSource } from "../../../../../runtime";
import type { StructureTree } from "../../../StructureTree/StructureTree";

export function syncStructureTreeDataSources(
    root: ShadowRoot,
    dataSources: EditorDataSource[],
    isStructureTree: (value: Element | null | undefined) => value is StructureTree,
): void {
    const tree = root.querySelector("cms-editor-v2-structure-tree");
    if (isStructureTree(tree)) {
        tree.setDataSources(dataSources);
        return;
    }

    customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
        const upgradedTree = root.querySelector("cms-editor-v2-structure-tree");
        if (isStructureTree(upgradedTree)) {
            upgradedTree.setDataSources(dataSources);
        }
    });
}
