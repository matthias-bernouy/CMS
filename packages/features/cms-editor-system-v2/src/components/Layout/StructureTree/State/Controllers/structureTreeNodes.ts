import {
    CMS_BINDING_ATTRIBUTES,
    type ContentSlot,
    type Editor,
    type CmsSourceState,
    type CmsSourceStatusCondition,
} from "@bernouy/cms-content/editor";
import type { EditorDataSource, EditorStructureNode, StructureNode } from "../../../../../runtime";
import {
    canDeleteNode,
    canDuplicateNode,
    nodeForEditor,
    parentStructureNode,
    sameSlot,
    slotChildCount,
    slotForChild,
} from "../structureNodeRelations";
import {
    editorChildrenOf,
    flattenStructureNodes,
    isDescendantStructureNode,
    pathToEditor,
    visibleStructureNodes,
} from "../structureTreeTraversal";
import type { StructureTreeState } from "../structureTreeState";
import {
    canSetSourceStatusCondition,
    sourceAncestorNodes,
    sourceStatusCondition,
    sourceStatusConditionDetails,
    sourceStatusConditions,
} from "./Support/structureSourceConditions";

export class StructureTreeNodes {
    constructor(private readonly state: StructureTreeState) {}

    canDuplicate(node: EditorStructureNode): boolean {
        return canDuplicateNode(
            node,
            (child) => this.parentNode(child),
            (parent, child) => this.slotForChild(parent, child),
            (parent, slot) => this.slotChildCount(parent, slot),
        );
    }

    canDelete(node: EditorStructureNode): boolean {
        return canDeleteNode(
            node,
            (child) => this.parentNode(child),
            (parent, child) => this.slotForChild(parent, child),
            (parent, slot) => this.slotChildCount(parent, slot),
        );
    }

    slotForChild(parent: EditorStructureNode, child: EditorStructureNode): ContentSlot | undefined {
        return slotForChild(parent, child);
    }

    sameSlot(left: ContentSlot, right: ContentSlot): boolean {
        return sameSlot(left, right);
    }

    slotChildCount(parent: EditorStructureNode, slot: ContentSlot): number {
        return slotChildCount(parent, slot, (value) => this.editorChildrenOf(value));
    }

    editorChildrenOf(parent: EditorStructureNode): EditorStructureNode[] {
        return editorChildrenOf(parent);
    }

    parentNode(child: EditorStructureNode): EditorStructureNode | null {
        return parentStructureNode(this.state.nodes, child);
    }

    nodeForEditor(editor: Editor): EditorStructureNode | null {
        return nodeForEditor(this.state.nodes, editor);
    }

    isDescendantNode(candidate: EditorStructureNode, parent: EditorStructureNode): boolean {
        return isDescendantStructureNode(candidate, parent);
    }

    visibleNodes(nodes = this.state.nodes, depth = 0): { item: StructureNode; depth: number }[] {
        return visibleStructureNodes(nodes, (node) => this.isCollapsed(node), depth);
    }

    expandPathToSelected(): void {
        if (!this.state.selectedEditor) {
            return;
        }
        const path = pathToEditor(this.state.nodes, this.state.selectedEditor);
        if (!path) {
            return;
        }
        for (const node of path.slice(0, -1)) {
            this.state.collapsedTargets.delete(this.nodeCollapseKey(node));
        }
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
        this.areBadgesExpanded(node)
            ? this.state.expandedBadgeTargets.delete(key)
            : this.state.expandedBadgeTargets.add(key);
    }

    areBadgesExpanded(node: StructureNode): boolean {
        return this.state.expandedBadgeTargets.has(this.nodeBadgeKey(node));
    }

    setRepeatableTargets(targets: HTMLElement[]): void {
        for (const node of flattenStructureNodes(this.state.nodes)) {
            if (!targets.includes(node.target)) {
                this.state.repeatableTargets.delete(node.target);
            }
        }
        for (const target of targets) {
            this.state.repeatableTargets.add(target);
        }
    }

    sourceDataSources(): EditorDataSource[] {
        return this.state.dataSources;
    }

    flattenNodes(nodes: StructureNode[]): StructureNode[] {
        return flattenStructureNodes(nodes);
    }

    nodeCollapseKey(node: StructureNode): HTMLElement | object {
        return node.target;
    }

    nodeBadgeKey(node: StructureNode): HTMLElement | object {
        return this.nodeCollapseKey(node);
    }

    nearestSourceNode(node: EditorStructureNode): EditorStructureNode | null {
        return this.sourceAncestorNodes(node)[0] ?? null;
    }

    sourceAncestorNodes(node: EditorStructureNode): EditorStructureNode[] {
        return sourceAncestorNodes(node, (candidate) => this.parentNode(candidate));
    }

    sourceStatusCondition(node: EditorStructureNode): CmsSourceState | null {
        return sourceStatusCondition(node);
    }

    sourceStatusConditionDetails(node: EditorStructureNode): CmsSourceStatusCondition | null {
        return sourceStatusConditionDetails(node);
    }

    sourceStatusConditions(node: EditorStructureNode): CmsSourceStatusCondition[] {
        return sourceStatusConditions(node);
    }

    canSetSourceStatusCondition(
        node: EditorStructureNode,
        source: EditorStructureNode | null = this.nearestSourceNode(node),
    ): boolean {
        return canSetSourceStatusCondition(node, source);
    }
}
