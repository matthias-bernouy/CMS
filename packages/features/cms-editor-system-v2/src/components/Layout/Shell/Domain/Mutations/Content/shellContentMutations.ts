import {
    sourceStatusConditionsFromElement,
    type ContentSlot,
    type Editor,
    type CmsSourceStatusCondition,
} from "@bernouy/cms-content/editor";

import type { BlockPickerItem } from "../../../../Pickers/BlockPickerModal/BlockPickerModal";
import type { MutationContext } from "../shellMutations";
import { createInsertion } from "../insertion";
import { canInsertNodeCount, canReplaceNodeCount, findSlot, isSlotFull, parentEditor } from "../slots";
import { reloadFrameDocument } from "./reloadFrameDocument";
import {
    acceptsCatalogEntry,
    acceptsElementForParent,
    isElementPlacementAllowedAtRoot,
} from "../../../../../../policy/contentSlotAcceptance";
import { isEditorPlacementAllowed } from "../../../../../../policy/editorPlacement";
import {
    insertChildMedia,
    insertRootMedia,
    replaceChildWithMedia,
    replaceRootWithMedia,
} from "./mediaContentMutations";

export class ShellContentMutations {
    constructor(private readonly context: MutationContext) {}

    addChild(parent: Editor, item: BlockPickerItem, slotName?: string): void {
        const document = this.context.editorDocument();
        if (!document?.contentRoot.contains(parent.target)) {
            return;
        }
        const slot = findSlot(parent, slotName);
        if (!slot || isSlotFull(parent, slot)) {
            return;
        }
        if (item.kind === "media") {
            insertChildMedia(this.context, parent, item, slot, slotName);
            return;
        }
        if (!acceptsCatalogEntry(slot, item.entry, parent.target.localName)) {
            return;
        }

        const insertion = this.createInsertion(item, slotName);
        if (
            !insertion ||
            insertion.slotElements.some(
                (element) => !acceptsElementForParent(slot, element, this.context.catalog(), parent.target.localName),
            ) ||
            !canInsertNodeCount(parent, slot, insertion.slotElements)
        ) {
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
        if (!document) {
            return;
        }
        if (item.kind === "media") {
            insertRootMedia(this.context, item);
            return;
        }
        if (!isEditorPlacementAllowed(item.entry, { kind: "root" })) {
            return;
        }
        const insertion = this.createInsertion(item);
        if (
            !insertion ||
            insertion.slotElements.some((element) => !isElementPlacementAllowedAtRoot(element, this.context.catalog()))
        ) {
            return;
        }

        if (this.context.isEmptyDocumentContent()) {
            document.contentRoot.replaceChildren();
        }
        document.contentRoot.append(insertion.fragment);
        reloadFrameDocument(this.context, insertion.selectionTarget);
    }

    replaceEditor(editor: Editor, item: BlockPickerItem, slotName?: string): void {
        const document = this.context.editorDocument();
        if (!document?.contentRoot.contains(editor.target)) {
            return;
        }
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
            replaceChildWithMedia(this.context, editor, parent, item, slot, slotName, sourceStatusConditions);
            return;
        }
        if (!acceptsCatalogEntry(slot, item.entry, parent.target.localName)) {
            return;
        }

        const insertion = this.createInsertion(item, slotName, sourceStatusConditions);
        if (
            !insertion ||
            insertion.slotElements.some(
                (element) => !acceptsElementForParent(slot, element, this.context.catalog(), parent.target.localName),
            ) ||
            !canReplaceNodeCount(parent, editor, slot, insertion.slotElements)
        ) {
            return;
        }

        editor.target.replaceWith(insertion.fragment);
        reloadFrameDocument(this.context, insertion.selectionTarget);
    }

    private replaceRootEditor(editor: Editor, item: BlockPickerItem): void {
        const document = this.context.editorDocument();
        if (!document?.contentRoot.contains(editor.target)) {
            return;
        }
        if (item.kind === "media") {
            replaceRootWithMedia(this.context, editor, item);
            return;
        }
        if (!isEditorPlacementAllowed(item.entry, { kind: "root" })) {
            return;
        }
        const insertion = this.createInsertion(item);
        if (
            !insertion ||
            insertion.slotElements.some((element) => !isElementPlacementAllowedAtRoot(element, this.context.catalog()))
        ) {
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
}
