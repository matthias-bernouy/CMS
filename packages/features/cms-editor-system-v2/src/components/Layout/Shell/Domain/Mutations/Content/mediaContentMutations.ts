import {
    applySourceStatusConditions,
    type CmsSourceStatusCondition,
    type ContentSlot,
    type Editor,
} from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../../../../Pickers/BlockPickerModal/BlockPickerModal";
import type { MutationContext } from "../shellMutations";
import { applySlot } from "../insertion";
import { canInsertNodeCount, canReplaceNodeCount, remainingSlotCapacity } from "../slots";
import { openMediaPicker } from "../media";
import { reloadFrameDocument } from "./reloadFrameDocument";
import {
    acceptsElementForParent,
    isElementPlacementAllowedAtRoot,
    mediaElementMatchesAccept,
    mediaAcceptForRootItem,
    mediaAcceptForSlotItem,
} from "../../../../../../policy/contentSlotAcceptance";

type MediaPickerItem = Extract<BlockPickerItem, { kind: "media" }>;

export function insertRootMedia(context: MutationContext, item: MediaPickerItem): void {
    const document = context.editorDocument();
    const accept = mediaAcceptForRootItem(item);
    if (!document || !accept) {
        return;
    }
    openMediaPicker(context.frameDocument(), accept, { multiple: false }, (elements) => {
        const element = elements[0];
        if (
            context.editorDocument() !== document ||
            !element ||
            !mediaElementMatchesAccept(element, accept) ||
            !isElementPlacementAllowedAtRoot(element, context.catalog())
        ) {
            return;
        }
        if (context.isEmptyDocumentContent()) {
            document.contentRoot.replaceChildren();
        }
        document.contentRoot.append(element);
        reloadFrameDocument(context, element);
    });
}

export function replaceRootWithMedia(context: MutationContext, editor: Editor, item: MediaPickerItem): void {
    const document = context.editorDocument();
    const accept = mediaAcceptForRootItem(item);
    if (!document || !accept) {
        return;
    }
    openMediaPicker(context.frameDocument(), accept, { multiple: false }, (elements) => {
        const element = elements[0];
        if (
            context.editorDocument() !== document ||
            !element ||
            !document.contentRoot.contains(editor.target) ||
            !mediaElementMatchesAccept(element, accept) ||
            !isElementPlacementAllowedAtRoot(element, context.catalog())
        ) {
            return;
        }
        editor.target.replaceWith(element);
        reloadFrameDocument(context, element);
    });
}

export function insertChildMedia(
    context: MutationContext,
    parent: Editor,
    item: MediaPickerItem,
    slot: ContentSlot,
    slotName?: string,
    sourceStatusConditions?: CmsSourceStatusCondition[],
): void {
    const document = context.editorDocument();
    const remaining = remainingSlotCapacity(parent, slot);
    const accept = mediaAcceptForSlotItem(slot, item);
    if (!document || !document.contentRoot.contains(parent.target) || remaining <= 0 || !accept) {
        return;
    }
    openMediaPicker(
        context.frameDocument(),
        accept,
        {
            multiple: remaining > 1,
            maxSelection: typeof slot.max === "number" ? remaining : undefined,
        },
        (elements) => appendMedia(context, document, parent, slot, accept, elements, slotName, sourceStatusConditions),
    );
}

export function replaceChildWithMedia(
    context: MutationContext,
    editor: Editor,
    parent: Editor,
    item: MediaPickerItem,
    slot: ContentSlot,
    slotName?: string,
    sourceStatusConditions?: CmsSourceStatusCondition[],
): void {
    const document = context.editorDocument();
    const accept = mediaAcceptForSlotItem(slot, item);
    if (
        !document ||
        !document.contentRoot.contains(parent.target) ||
        !document.contentRoot.contains(editor.target) ||
        !accept ||
        !canReplaceNodeCount(parent, editor, slot, [editor.target])
    ) {
        return;
    }
    openMediaPicker(context.frameDocument(), accept, { multiple: false }, (elements) => {
        const element = elements[0];
        if (
            context.editorDocument() !== document ||
            !element ||
            !document.contentRoot.contains(parent.target) ||
            !document.contentRoot.contains(editor.target) ||
            !mediaElementMatchesAccept(element, accept) ||
            !acceptsElementForParent(slot, element, context.catalog(), parent.target.localName) ||
            !canReplaceNodeCount(parent, editor, slot, [element])
        ) {
            return;
        }
        applySlot(element, slotName);
        applySourceConditions(element, sourceStatusConditions);
        editor.target.replaceWith(element);
        reloadFrameDocument(context, element);
    });
}

function appendMedia(
    context: MutationContext,
    document: NonNullable<ReturnType<MutationContext["editorDocument"]>>,
    parent: Editor,
    slot: ContentSlot,
    accept: Parameters<typeof mediaElementMatchesAccept>[1],
    elements: HTMLElement[],
    slotName?: string,
    sourceStatusConditions?: CmsSourceStatusCondition[],
): void {
    if (
        context.editorDocument() !== document ||
        !document.contentRoot.contains(parent.target) ||
        elements.length === 0 ||
        elements.some(
            (element) =>
                !mediaElementMatchesAccept(element, accept) ||
                !acceptsElementForParent(slot, element, context.catalog(), parent.target.localName),
        ) ||
        !canInsertNodeCount(parent, slot, elements)
    ) {
        return;
    }
    for (const element of elements) {
        applySlot(element, slotName);
        applySourceConditions(element, sourceStatusConditions);
    }
    parent.target.append(...elements);
    reloadFrameDocument(context, elements[0] ?? null);
}

function applySourceConditions(element: HTMLElement, conditions?: CmsSourceStatusCondition[]): void {
    if (conditions?.length) {
        applySourceStatusConditions(element, conditions);
    }
}
