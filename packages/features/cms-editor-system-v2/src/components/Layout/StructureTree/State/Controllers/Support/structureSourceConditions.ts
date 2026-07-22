import {
    CMS_BINDING_ATTRIBUTES,
    sourceStatusConditionDetailsFromElement,
    sourceStatusConditionsFromElement,
    type CmsSourceStatusCondition,
} from "@bernouy/cms-content/editor";
import type { CmsSourceState } from "@bernouy/cms-content/editor";
import type { EditorStructureNode } from "../../../../../../runtime";

type ParentNodeResolver = (node: EditorStructureNode) => EditorStructureNode | null;

export function sourceAncestorNodes(node: EditorStructureNode, parentNode: ParentNodeResolver): EditorStructureNode[] {
    const sources: EditorStructureNode[] = [];
    for (let current = parentNode(node); current; current = parentNode(current)) {
        if (current.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source)) {
            sources.push(current);
        }
    }
    return sources;
}

export function sourceStatusCondition(node: EditorStructureNode): CmsSourceState | null {
    return sourceStatusConditionDetailsFromElement(node.target)?.state ?? null;
}

export function sourceStatusConditionDetails(node: EditorStructureNode): CmsSourceStatusCondition | null {
    return sourceStatusConditionDetailsFromElement(node.target);
}

export function sourceStatusConditions(node: EditorStructureNode): CmsSourceStatusCondition[] {
    return sourceStatusConditionsFromElement(node.target);
}

export function canSetSourceStatusCondition(node: EditorStructureNode, source: EditorStructureNode | null): boolean {
    if (!source || !source.target.contains(node.target) || source.target === node.target) {
        return false;
    }
    if (hasNonSourceStatusCondition(node.target)) {
        return false;
    }
    return !hasSourceStatusConditionAncestor(node.target, source.target);
}

function nearestSourceAncestor(target: HTMLElement): HTMLElement | null {
    for (let current = target.parentElement; current; current = current.parentElement) {
        if (current.hasAttribute(CMS_BINDING_ATTRIBUTES.source)) {
            return current;
        }
    }
    return null;
}

function hasSourceStatusConditionAncestor(target: HTMLElement, source: HTMLElement): boolean {
    for (let current = target.parentElement; current && current !== source; current = current.parentElement) {
        if (sourceStatusConditionTargetsSource(current, source)) {
            return true;
        }
    }
    return false;
}

function hasNonSourceStatusCondition(target: HTMLElement): boolean {
    return (
        target.hasAttribute(CMS_BINDING_ATTRIBUTES.condition) && sourceStatusConditionsFromElement(target).length === 0
    );
}

function sourceStatusConditionTargetsSource(target: HTMLElement, source: HTMLElement): boolean {
    const conditions = sourceStatusConditionsFromElement(target);
    return conditions.some((condition) => {
        if (condition.sourceId) {
            return condition.sourceId === source.getAttribute(CMS_BINDING_ATTRIBUTES.sourceId);
        }
        return nearestSourceAncestor(target) === source;
    });
}
