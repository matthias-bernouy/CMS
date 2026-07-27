import type { ContentSlot, Editor, EditorCatalog, CmsSourceStatusCondition } from "@bernouy/cms-content/editor";

import type { EditorRuntime } from "../../../../../runtime";
import { applySlot } from "./insertion";
import { acceptsElement } from "../../../../../policy/contentSlotAcceptance";

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

    const replacedCount = (replaced.target.getAttribute("slot") ?? undefined) === (slot.slot ?? undefined) ? 1 : 0;
    return slotChildCount(parent, slot) - replacedCount + insertedElements.length <= slot.max;
}

export function canDuplicate(runtime: EditorRuntime | null, editor: Editor, catalog: EditorCatalog): boolean {
    const parent = parentEditor(runtime, editor);
    if (!parent) {
        return true;
    }

    const slot = findSlot(parent, editor.target.getAttribute("slot") ?? undefined);
    if (!slot) {
        return true;
    }

    return acceptsElement(slot, editor.target, catalog) && !isSlotFull(parent, slot);
}

export function canDelete(runtime: EditorRuntime | null, editor: Editor): boolean {
    const parent = parentEditor(runtime, editor);
    if (!parent) {
        return true;
    }

    const slot = findSlot(parent, editor.target.getAttribute("slot") ?? undefined);
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
        applySlot(insertedElement, undefined);
        applySourceConditions(insertedElement, []);
        return true;
    }

    const slotName = reference.target.getAttribute("slot") ?? undefined;
    const slot = findSlot(parent, slotName);
    if (
        !slot ||
        !acceptsElement(slot, insertedElement, catalog) ||
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
    const targetSlotName = target.target.getAttribute("slot") ?? undefined;
    const isSameSlot =
        sourceParent === targetParent && (source.target.getAttribute("slot") ?? undefined) === targetSlotName;
    if (!isSameSlot && !canDelete(runtime, source)) {
        return false;
    }

    if (!targetParent) {
        return true;
    }

    const targetSlot = findSlot(targetParent, targetSlotName);
    if (!targetSlot || !acceptsElement(targetSlot, source.target, catalog)) {
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
    return Array.from(parent.target.children).filter(
        (child) => (child.getAttribute("slot") ?? undefined) === (slot.slot ?? undefined),
    ).length;
}
