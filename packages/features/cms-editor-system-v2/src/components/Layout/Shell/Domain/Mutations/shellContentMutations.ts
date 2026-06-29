import {
    applySourceStatusConditions,
    CMS_BINDING_CORE_TAG,
    sourceStatusConditionsFromElement,
    type ContentSlot,
    type Editor,
    type CmsSourceStatusCondition,
} from "@bernouy/cms-content/editor";

import type { BlockPickerItem } from "../../../BlockPickerModal/BlockPickerModal";
import type { MutationContext } from "./shellMutations";
import {
    applySlot,
    createInsertion,
    snippetItems,
} from "./insertion";
import {
    canInsertNodeCount,
    canReplaceNodeCount,
    findSlot,
    isSlotFull,
    parentEditor,
    remainingSlotCapacity,
} from "./slots";
import { openMediaPicker } from "./media";

export class ShellContentMutations {
    constructor(private readonly context: MutationContext) {}

    addChild(parent: Editor, item: BlockPickerItem, slotName?: string): void {
        const slot = findSlot(parent, slotName);
        if (!slot || isSlotFull(parent, slot)) return;
        if (item.kind === "media") return this.insertMedia(parent, item, slot, slotName);

        const insertion = this.createInsertion(item, slotName);
        if (!insertion || !canInsertNodeCount(parent, slot, insertion.slotElements)) return;

        parent.target.append(insertion.fragment);
        this.reloadFrameDocument(insertion.selectionTarget);
    }

    addRoot(item: BlockPickerItem): void {
        const document = this.context.editorDocument();
        if (!document || item.kind === "media") return;
        const insertion = this.createInsertion(item);
        if (!insertion) return;

        if (this.context.isEmptyDocumentContent()) document.contentRoot.replaceChildren();
        document.contentRoot.append(insertion.fragment);
        this.reloadFrameDocument(insertion.selectionTarget);
    }

    replaceEditor(editor: Editor, item: BlockPickerItem, slotName?: string): void {
        const parent = parentEditor(this.context.runtime(), editor);
        if (!parent) return this.replaceRootEditor(editor, item);

        const slot = findSlot(parent, slotName);
        if (!slot) return;
        const sourceStatusConditions = sourceStatusConditionsFromElement(editor.target);
        if (item.kind === "media") return this.replaceWithMedia(editor, parent, item, slot, slotName, sourceStatusConditions);

        const insertion = this.createInsertion(item, slotName, sourceStatusConditions);
        if (!insertion || !canReplaceNodeCount(parent, editor, slot, insertion.slotElements)) return;

        editor.target.replaceWith(insertion.fragment);
        this.reloadFrameDocument(insertion.selectionTarget);
    }

    reloadFrameDocument(selectedTarget: HTMLElement | null = null): void {
        const frameDocument = this.context.frameDocument();
        if (!frameDocument) return;

        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")
            ?? frameDocument.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG);
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]");
        if (!root || !contentRoot) return;

        this.context.loadDocument({ root, contentRoot }, selectedTarget);
        this.context.syncViewFrameContent();
    }

    private replaceRootEditor(editor: Editor, item: BlockPickerItem): void {
        if (item.kind === "media") return;
        const insertion = this.createInsertion(item);
        if (!insertion) return;

        editor.target.replaceWith(insertion.fragment);
        this.reloadFrameDocument(insertion.selectionTarget);
    }

    private createInsertion(item: BlockPickerItem, slotName?: string, sourceStatusConditions?: CmsSourceStatusCondition[]) {
        return createInsertion(this.context.frameDocument(), item, snippetItems(this.context.insertItems()), slotName, sourceStatusConditions);
    }

    private insertMedia(parent: Editor, item: Extract<BlockPickerItem, { kind: "media" }>, slot: ContentSlot, slotName?: string, sourceStatusConditions?: CmsSourceStatusCondition[]): void {
        const remaining = remainingSlotCapacity(parent, slot);
        if (remaining <= 0) return;
        openMediaPicker(this.context.frameDocument(), item.accept, {
            multiple:     remaining > 1,
            maxSelection: typeof slot.max === "number" ? remaining : undefined,
        }, elements => this.appendMedia(parent, slot, elements, slotName, sourceStatusConditions));
    }

    private appendMedia(parent: Editor, slot: ContentSlot, elements: HTMLElement[], slotName?: string, sourceStatusConditions?: CmsSourceStatusCondition[]): void {
        if (elements.length === 0 || !canInsertNodeCount(parent, slot, elements)) return;
        for (const element of elements) {
            applySlot(element, slotName);
            if (sourceStatusConditions?.length) applySourceStatusConditions(element, sourceStatusConditions);
        }
        parent.target.append(...elements);
        this.reloadFrameDocument(elements[0] ?? null);
    }

    private replaceWithMedia(editor: Editor, parent: Editor, item: Extract<BlockPickerItem, { kind: "media" }>, slot: ContentSlot, slotName?: string, sourceStatusConditions?: CmsSourceStatusCondition[]): void {
        if (!canReplaceNodeCount(parent, editor, slot, [editor.target])) return;
        openMediaPicker(this.context.frameDocument(), item.accept, { multiple: false }, elements => {
            const element = elements[0];
            if (!element) return;
            applySlot(element, slotName);
            if (sourceStatusConditions?.length) applySourceStatusConditions(element, sourceStatusConditions);
            editor.target.replaceWith(element);
            this.reloadFrameDocument(element);
        });
    }
}
