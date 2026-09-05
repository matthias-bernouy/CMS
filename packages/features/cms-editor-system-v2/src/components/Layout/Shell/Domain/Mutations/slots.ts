import type { ContentSlot, Editor, EditorCatalog, CmsSourceStatusCondition } from "@bernouy/cms-content/editor";

import type { EditorRuntime } from "../../../../../runtime";
import { applySlot } from "./insertion";
import { acceptsElementForParent, isElementPlacementAllowedAtRoot } from "../../../../../policy/contentSlotAcceptance";
import { isEditorPlacementAllowed } from "../../../../../policy/editorPlacement";
import { COMPOSITION_AUTHORED_ATTRIBUTE, isCompositionRuntimeElement } from "@bernouy/components/base";

export function canInsertNodeCount(parent: Editor, slot: ContentSlot, insertedElements: HTMLElement[]): boolean {
    if (typeof slot.max !== "number") {
        return true;
    }
    return slotChildCount(parent, slot) + insertedElements.length <= slot.max;
}

export function canReplaceNodeCount(
    parent: Editor,
    replaced: Editor,
    slot: ContentSlot,
    insertedElements: HTMLElement[],
): boolean {
    if (typeof slot.max !== "number") {
        return true;
    }

    const replacedSlot = replaced.target.hasAttribute(COMPOSITION_AUTHORED_ATTRIBUTE)
        ? replaced.target.getAttribute(COMPOSITION_AUTHORED_ATTRIBUTE) || undefined
        : (replaced.target.getAttribute("slot") ?? undefined);
    const replacedCount = replacedSlot === (slot.slot ?? undefined) ? 1 : 0;
    return slotChildCount(parent, slot) - replacedCount + insertedElements.length <= slot.max;
}

export function canDuplicate(runtime: EditorRuntime | null, editor: Editor, catalog: EditorCatalog): boolean {
    const parent = parentEditor(runtime, editor);
    if (!parent) {
        return isElementPlacementAllowedAtRoot(editor.target, catalog);
    }

    const slot = findSlot(parent, authoredSlot(editor.target));
    if (!slot) {
        const entry = catalog.find((candidate) => candidate.tag.toLowerCase() === editor.target.localName);
        return entry ? isEditorPlacementAllowed(entry, { kind: "root" }) : true;
    }

    return acceptsElementForParent(slot, editor.target, catalog, parent.target.localName) && !isSlotFull(parent, slot);
}

export function canDelete(runtime: EditorRuntime | null, editor: Editor): boolean {
    const parent = parentEditor(runtime, editor);
    if (!parent) {
        return true;
    }

    const slot = findSlot(parent, authoredSlot(editor.target));
    if (!slot?.min) {
        return true;
    }

    return slotChildCount(parent, slot) > slot.min;
}

export function canInsertSibling(
    runtime: EditorRuntime | null,
    reference: Editor,
    insertedElement: HTMLElement,
    catalog: EditorCatalog,
    applySourceConditions: (element: HTMLElement, conditions: CmsSourceStatusCondition[]) => void,
    sourceConditionsForSibling: (reference: Editor) => CmsSourceStatusCondition[],
): boolean {
    const parent = parentEditor(runtime, reference);
    if (!parent) {
        if (!isElementPlacementAllowedAtRoot(insertedElement, catalog)) {
            return false;
        }
        applySlot(insertedElement, undefined);
        applySourceConditions(insertedElement, []);
        return true;
    }

    const slotName = authoredSlot(reference.target);
    const slot = findSlot(parent, slotName);
    if (
        !slot ||
        !acceptsElementForParent(slot, insertedElement, catalog, parent.target.localName) ||
        !canInsertNodeCount(parent, slot, [insertedElement])
    ) {
        return false;
    }

    applySlot(insertedElement, slotName);
    applySourceConditions(insertedElement, sourceConditionsForSibling(reference));
    return true;
}

export function canMoveEditor(
    runtime: EditorRuntime | null,
    source: Editor,
    target: Editor,
    catalog: EditorCatalog,
): boolean {
    const sourceParent = parentEditor(runtime, source);
    const targetParent = parentEditor(runtime, target);
    const targetSlotName = authoredSlot(target.target);
    const isSameSlot = sourceParent === targetParent && authoredSlot(source.target) === targetSlotName;
    if (!isSameSlot && !canDelete(runtime, source)) {
        return false;
    }

    if (!targetParent) {
        return isElementPlacementAllowedAtRoot(source.target, catalog);
    }

    const targetSlot = findSlot(targetParent, targetSlotName);
    if (!targetSlot || !acceptsElementForParent(targetSlot, source.target, catalog, targetParent.target.localName)) {
        return false;
    }

    if (isSameSlot) {
        return true;
    }

    return canInsertNodeCount(targetParent, targetSlot, [source.target]);
}

export function isSlotFull(parent: Editor, slot: ContentSlot): boolean {
    return typeof slot.max === "number" && slotChildCount(parent, slot) >= slot.max;
}

export function findSlot(parent: Editor, slotName: string | undefined): ContentSlot | undefined {
    return parent.getContentSlots().find((slot) => (slot.slot ?? undefined) === slotName);
}

export function remainingSlotCapacity(parent: Editor, slot: ContentSlot): number {
    if (typeof slot.max !== "number") {
        return Number.MAX_SAFE_INTEGER;
    }
    return Math.max(0, slot.max - slotChildCount(parent, slot));
}

export function parentEditor(runtime: EditorRuntime | null, editor: Editor): Editor | null {
    if (!runtime || !editor.target.parentElement) {
        return null;
    }
    return runtime.getClosestEditor(editor.target.parentElement)?.target === editor.target
        ? null
        : (runtime.getClosestEditor(editor.target.parentElement) ?? null);
}

function slotChildCount(parent: Editor, slot: ContentSlot): number {
    const children = isCompositionRuntimeElement(parent.target)
        ? Array.from(parent.target.querySelectorAll<HTMLElement>(`[${COMPOSITION_AUTHORED_ATTRIBUTE}]`)).filter(
              (element) => nearestCompositionHost(element) === parent.target,
          )
        : Array.from(parent.target.children);
    return children.filter(
        (child) =>
            (child.hasAttribute(COMPOSITION_AUTHORED_ATTRIBUTE)
                ? child.getAttribute(COMPOSITION_AUTHORED_ATTRIBUTE) || undefined
                : (child.getAttribute("slot") ?? undefined)) === (slot.slot ?? undefined),
    ).length;
}

function nearestCompositionHost(element: HTMLElement): HTMLElement | null {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (isCompositionRuntimeElement(parent)) {
            return parent;
        }
    }
    return null;
}

export function authoredSlot(element: HTMLElement): string | undefined {
    return element.hasAttribute(COMPOSITION_AUTHORED_ATTRIBUTE)
        ? element.getAttribute(COMPOSITION_AUTHORED_ATTRIBUTE) || undefined
        : (element.getAttribute("slot") ?? undefined);
}
