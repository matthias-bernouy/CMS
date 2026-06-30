import {
    CMS_BINDING_ATTRIBUTES,
    sourceStatusConditionDetailsFromElement,
    sourceStatusConditionsFromElement,
    type ContentSlot,
    type Editor,
    type CmsSourceState,
    type CmsSourceStatusCondition,
} from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../../../BlockPickerModal/BlockPickerModal";
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
        return visibleStructureNodes(nodes, node => this.isCollapsed(node), depth);
    }

    expandPathToSelected(): void {
        if (!this.state.selectedEditor) return;
        const path = pathToEditor(this.state.nodes, this.state.selectedEditor);
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
            if (!targets.includes(node.target)) this.state.repeatableTargets.delete(node.target);
        }
        for (const target of targets) this.state.repeatableTargets.add(target);
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
        const sources: EditorStructureNode[] = [];
        for (let current = this.parentNode(node); current; current = this.parentNode(current)) {
            if (current.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source)) sources.push(current);
        }
        return sources;
    }

    sourceStatusCondition(node: EditorStructureNode): CmsSourceState | null {
        return sourceStatusConditionDetailsFromElement(node.target)?.state ?? null;
    }

    sourceStatusConditionDetails(node: EditorStructureNode): CmsSourceStatusCondition | null {
        return sourceStatusConditionDetailsFromElement(node.target);
    }

    sourceStatusConditions(node: EditorStructureNode): CmsSourceStatusCondition[] {
        return sourceStatusConditionsFromElement(node.target);
    }

    canSetSourceStatusCondition(node: EditorStructureNode, source: EditorStructureNode | null = this.nearestSourceNode(node)): boolean {
        if (!source) return false;
        if (!source.target.contains(node.target) || source.target === node.target) return false;
        if (hasNonSourceStatusCondition(node.target)) return false;
        return !hasSourceStatusConditionAncestor(node.target, source.target);
    }

    iconText(node: StructureNode): string { return structureIconText(node); }
    nodeLabel(node: StructureNode): string { return structureNodeLabel(node); }
    rowClass(node: StructureNode): string { return structureRowClass(node); }
    itemClass(node: StructureNode): string { return structureItemClass(node); }
    iconClass(node: StructureNode): string { return structureIconClass(node); }
    sourceActionLabel(node: EditorStructureNode): string { return sourceActionLabel(node); }
    isSnippetNode(node: EditorStructureNode): boolean { return isSnippetNode(node); }
    snippetItemForNode(node: EditorStructureNode): Extract<BlockPickerItem, { kind: "snippet" }> | null {
        return snippetItemForNode(node, this.state.insertItems);
    }
}

function nearestSourceAncestor(target: HTMLElement): HTMLElement | null {
    for (let current = target.parentElement; current; current = current.parentElement) {
        if (current.hasAttribute(CMS_BINDING_ATTRIBUTES.source)) return current;
    }
    return null;
}

function hasSourceStatusConditionAncestor(target: HTMLElement, source: HTMLElement): boolean {
    for (let current = target.parentElement; current && current !== source; current = current.parentElement) {
        if (sourceStatusConditionTargetsSource(current, source)) return true;
    }
    return false;
}

function hasNonSourceStatusCondition(target: HTMLElement): boolean {
    return target.hasAttribute(CMS_BINDING_ATTRIBUTES.condition) && sourceStatusConditionsFromElement(target).length === 0;
}

function sourceStatusConditionTargetsSource(target: HTMLElement, source: HTMLElement): boolean {
    const conditions = sourceStatusConditionsFromElement(target);
    return conditions.some(condition => {
        if (condition.sourceId) return condition.sourceId === source.getAttribute(CMS_BINDING_ATTRIBUTES.sourceId);
        return nearestSourceAncestor(target) === source;
    });
}
