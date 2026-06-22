import type { ContentSlot, Editor } from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../../../BlockPickerModal/BlockPickerModal";
import type { EditorDataSource, EditorStructureNode, SourceStateStructureNode, StructureNode } from "../../../../../runtime";
import {
    canDeleteNode,
    canDuplicateNode,
    nodeForEditor,
    parentStructureNode,
    sameSlot,
    slotChildCount,
    slotForChild,
    sourceStateKey,
} from "../structureNodeRelations";
import {
    editorChildrenOf,
    flattenStructureNodes,
    isDescendantStructureNode,
    pathToEditor,
    visibleStructureNodes,
} from "../structureTreeTraversal";
import {
    isSnippetNode,
    snippetItemForNode,
    sourceActionLabel,
    structureIconClass,
    structureIconText,
    structureItemClass,
    structureNodeLabel,
    structureRowClass,
} from "../../Renderers/structureTreePresentation";
import type { StructureTreeState } from "../structureTreeState";

export class StructureTreeNodes {
    constructor(private readonly state: StructureTreeState) {}

    canDuplicate(node: EditorStructureNode): boolean {
        return canDuplicateNode(node, child => this.parentNode(child), (parent, child) => this.slotForChild(parent, child), (parent, slot) => this.slotChildCount(parent, slot));
    }

    canDelete(node: EditorStructureNode): boolean {
        return canDeleteNode(node, child => this.parentNode(child), (parent, child) => this.slotForChild(parent, child), (parent, slot) => this.slotChildCount(parent, slot));
    }

    slotForChild(parent: EditorStructureNode, child: EditorStructureNode): ContentSlot | undefined {
        return slotForChild(parent, child);
    }

    sameSlot(left: ContentSlot, right: ContentSlot): boolean {
        return sameSlot(left, right);
    }

    slotChildCount(parent: EditorStructureNode, slot: ContentSlot): number {
        return slotChildCount(parent, slot, value => this.editorChildrenOf(value));
    }

    editorChildrenOf(parent: EditorStructureNode): EditorStructureNode[] {
        return editorChildrenOf(parent, node => this.isSourceStateNode(node));
    }

    parentNode(child: EditorStructureNode): EditorStructureNode | null {
        return parentStructureNode(this.state.nodes, child, node => this.isSourceStateNode(node), editor => this.nodeForEditor(editor));
    }

    nodeForEditor(editor: Editor): EditorStructureNode | null {
        return nodeForEditor(this.state.nodes, editor, node => this.isSourceStateNode(node));
    }

    isDescendantNode(candidate: EditorStructureNode, parent: EditorStructureNode): boolean {
        return isDescendantStructureNode(candidate, parent, node => this.isSourceStateNode(node));
    }

    visibleNodes(nodes = this.state.nodes, depth = 0): { item: StructureNode; depth: number }[] {
        return visibleStructureNodes(nodes, node => this.isCollapsed(node), depth);
    }

    expandPathToSelected(): void {
        if (!this.state.selectedEditor) return;
        const path = pathToEditor(this.state.nodes, this.state.selectedEditor, node => this.isSourceStateNode(node));
        if (!path) return;
        for (const node of path.slice(0, -1)) this.state.collapsedTargets.delete(this.nodeCollapseKey(node));
    }

    toggleNode(node: StructureNode): void {
        const key = this.nodeCollapseKey(node);
        this.isCollapsed(node) ? this.state.collapsedTargets.delete(key) : this.state.collapsedTargets.add(key);
    }

    isCollapsed(node: StructureNode): boolean {
        return this.state.collapsedTargets.has(this.nodeCollapseKey(node));
    }

    visibleBadges(node: StructureNode): string[] {
        return this.areBadgesExpanded(node) ? node.badges : node.badges.slice(0, 2);
    }

    toggleBadges(node: StructureNode): void {
        const key = this.nodeBadgeKey(node);
        this.areBadgesExpanded(node) ? this.state.expandedBadgeTargets.delete(key) : this.state.expandedBadgeTargets.add(key);
    }

    areBadgesExpanded(node: StructureNode): boolean {
        return this.state.expandedBadgeTargets.has(this.nodeBadgeKey(node));
    }

    setRepeatableTargets(targets: HTMLElement[]): void {
        for (const node of flattenStructureNodes(this.state.nodes)) {
            if (!this.isSourceStateNode(node) && !targets.includes(node.target)) this.state.repeatableTargets.delete(node.target);
        }
        for (const target of targets) this.state.repeatableTargets.add(target);
    }

    sourceDataSources(): EditorDataSource[] {
        return this.state.dataSources.filter(source => (source.method ?? "GET") === "GET");
    }

    flattenNodes(nodes: StructureNode[]): StructureNode[] {
        return flattenStructureNodes(nodes);
    }

    isSourceStateNode(node: StructureNode): node is SourceStateStructureNode {
        return node.kind === "source-state";
    }

    nodeCollapseKey(node: StructureNode): HTMLElement | object {
        return this.isSourceStateNode(node) ? sourceStateKey(this.state.sourceStateKeys, node) : node.target;
    }

    nodeBadgeKey(node: StructureNode): HTMLElement | object {
        return this.nodeCollapseKey(node);
    }

    iconText(node: StructureNode): string { return structureIconText(node, value => this.isSourceStateNode(value)); }
    nodeLabel(node: StructureNode): string { return structureNodeLabel(node, value => this.isSourceStateNode(value)); }
    rowClass(node: StructureNode): string { return structureRowClass(node, value => this.isSourceStateNode(value)); }
    itemClass(node: StructureNode): string { return structureItemClass(node, value => this.isSourceStateNode(value)); }
    iconClass(node: StructureNode): string { return structureIconClass(node, value => this.isSourceStateNode(value)); }
    sourceActionLabel(node: EditorStructureNode): string { return sourceActionLabel(node); }
    isSnippetNode(node: EditorStructureNode): boolean { return isSnippetNode(node); }
    snippetItemForNode(node: EditorStructureNode): Extract<BlockPickerItem, { kind: "snippet" }> | null {
        return snippetItemForNode(node, this.state.insertItems);
    }
}
