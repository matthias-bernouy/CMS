import {
    applySourceStatusConditions,
    sourceStatusConditionsFromElement,
    type ContentSlot,
    type Editor,
    type CmsSourceStatusCondition,
} from "@bernouy/cms-content/editor";

import type { BlockPickerItem } from "../../../../Pickers/BlockPickerModal/BlockPickerModal";
import type { MutationContext } from "../shellMutations";
import { applySlot, createInsertion } from "../insertion";
import {
    canInsertNodeCount,
    canReplaceNodeCount,
    findSlot,
    isSlotFull,
    parentEditor,
    remainingSlotCapacity,
} from "../slots";
import { openMediaPicker } from "../media";
import { reloadFrameDocument } from "./reloadFrameDocument";

export class ShellContentMutations {
    constructor(private readonly context: MutationContext) {}

    addChild(parent: Editor, item: BlockPickerItem, slotName?: string): void {
        const slot = findSlot(parent, slotName);
        if (!slot || isSlotFull(parent, slot)) {
            return;
        }
        if (item.kind === "media") {
            return this.insertMedia(parent, item, slot, slotName);
        }

        const insertion = this.createInsertion(item, slotName);
        if (!insertion || !canInsertNodeCount(parent, slot, insertion.slotElements)) {
            return;
        }

        parent.target.append(insertion.fragment);
        reloadFrameDocument(this.context, insertion.selectionTarget);
    }

    addRoot(item: BlockPickerItem, slotName?: string): void {
        const rootEditor = this.context.rootEditor?.();
        if (rootEditor?.getContentSlots().length) {
            this.addChild(rootEditor, item, slotName);
            return;
        }
        const document = this.context.editorDocument();
        if (!document || item.kind === "media") {
            return;
        }
        const insertion = this.createInsertion(item);
        if (!insertion) {
            return;
        }

        if (this.context.isEmptyDocumentContent()) {
            document.contentRoot.replaceChildren();
        }
        document.contentRoot.append(insertion.fragment);
        reloadFrameDocument(this.context, insertion.selectionTarget);
    }

    replaceEditor(editor: Editor, item: BlockPickerItem, slotName?: string): void {
        const parent = parentEditor(this.context.runtime(), editor);
        if (!parent) {
            return this.replaceRootEditor(editor, item);
        }

        const slot = findSlot(parent, slotName);
        if (!slot) {
            return;
        }
        const sourceStatusConditions = sourceStatusConditionsFromElement(editor.target);
        if (item.kind === "media") {
            return this.replaceWithMedia(editor, parent, item, slot, slotName, sourceStatusConditions);
        }

        const insertion = this.createInsertion(item, slotName, sourceStatusConditions);
        if (!insertion || !canReplaceNodeCount(parent, editor, slot, insertion.slotElements)) {
            return;
        }

        editor.target.replaceWith(insertion.fragment);
        reloadFrameDocument(this.context, insertion.selectionTarget);
    }

    private replaceRootEditor(editor: Editor, item: BlockPickerItem): void {
        if (item.kind === "media") {
            return;
        }
        const insertion = this.createInsertion(item);
        if (!insertion) {
            return;
        }
        editor.target.replaceWith(insertion.fragment);
        reloadFrameDocument(this.context, insertion.selectionTarget);
    }

    private createInsertion(
        item: BlockPickerItem,
        slotName?: string,
        sourceStatusConditions?: CmsSourceStatusCondition[],
    ) {
        return createInsertion(this.context.frameDocument(), item, slotName, sourceStatusConditions);
    }

    private insertMedia(
        parent: Editor,
        item: Extract<BlockPickerItem, { kind: "media" }>,
        slot: ContentSlot,
        slotName?: string,
        sourceStatusConditions?: CmsSourceStatusCondition[],
    ): void {
        const remaining = remainingSlotCapacity(parent, slot);
        if (remaining <= 0) {
            return;
        }
        openMediaPicker(
            this.context.frameDocument(),
            item.accept,
            {
                multiple: remaining > 1,
                maxSelection: typeof slot.max === "number" ? remaining : undefined,
            },
            (elements) => this.appendMedia(parent, slot, elements, slotName, sourceStatusConditions),
        );
    }

    private appendMedia(
        parent: Editor,
        slot: ContentSlot,
        elements: HTMLElement[],
        slotName?: string,
        sourceStatusConditions?: CmsSourceStatusCondition[],
    ): void {
        if (elements.length === 0 || !canInsertNodeCount(parent, slot, elements)) {
            return;
        }
        for (const element of elements) {
            applySlot(element, slotName);
            if (sourceStatusConditions?.length) {
                applySourceStatusConditions(element, sourceStatusConditions);
            }
        }
        parent.target.append(...elements);
        reloadFrameDocument(this.context, elements[0] ?? null);
    }

    private replaceWithMedia(
        editor: Editor,
        parent: Editor,
        item: Extract<BlockPickerItem, { kind: "media" }>,
        slot: ContentSlot,
        slotName?: string,
        sourceStatusConditions?: CmsSourceStatusCondition[],
    ): void {
        if (!canReplaceNodeCount(parent, editor, slot, [editor.target])) {
            return;
        }
        const className = editor.target.getAttribute("class");
        openMediaPicker(this.context.frameDocument(), item.accept, { multiple: false }, (elements) => {
            const element = elements[0];
            if (!element) {
                return;
            }
            applySlot(element, slotName);
            if (className) {
                element.setAttribute("class", className);
            }
            if (sourceStatusConditions?.length) {
                applySourceStatusConditions(element, sourceStatusConditions);
            }
            editor.target.replaceWith(element);
            reloadFrameDocument(this.context, element);
        });
    }
}
