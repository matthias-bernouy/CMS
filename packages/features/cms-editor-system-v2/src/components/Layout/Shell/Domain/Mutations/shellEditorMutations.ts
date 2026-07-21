import {
    applySourceStatusConditions,
    CMS_BINDING_ATTRIBUTES,
    sourceStatusConditionsFromElement,
    type CmsSourceStatusCondition,
    type Editor,
} from "@bernouy/cms-content/editor";

import type { MutationContext } from "./shellMutations";
import type { ShellContentMutations } from "./shellContentMutations";
import { applySlot } from "./insertion";
import { canDelete, canDuplicate, canInsertSibling, canMoveEditor } from "./slots";

export class ShellEditorMutations {
    private _clipboardElement: HTMLElement | null = null;

    constructor(
        private readonly context: MutationContext,
        private readonly content: ShellContentMutations,
    ) {}

    duplicateEditor(editor: Editor): void {
        if (!canDuplicate(this.context.runtime(), editor)) {
            return;
        }

        const clone = editor.target.cloneNode(true) as HTMLElement;
        editor.target.after(clone);
        this.content.reloadFrameDocument(clone);
    }

    deleteEditor(editor: Editor): void {
        if (!canDelete(this.context.runtime(), editor)) {
            return;
        }

        const nextSelectionTarget = this.findNextSelectionTargetAfterDelete(editor);
        editor.target.remove();
        this.content.reloadFrameDocument(nextSelectionTarget);
    }

    copyEditor(editor: Editor): void {
        this._clipboardElement = editor.target.cloneNode(true) as HTMLElement;
    }

    pasteAfter(editor: Editor | null): void {
        const document = this.context.editorDocument();
        if (!this._clipboardElement || !document) {
            return;
        }

        const clone = this._clipboardElement.cloneNode(true) as HTMLElement;
        if (!editor) {
            document.contentRoot.append(clone);
            this.content.reloadFrameDocument(clone);
            return;
        }

        if (
            !canInsertSibling(
                this.context.runtime(),
                editor,
                clone,
                (element, state) => {
                    if (state.length) {
                        applySourceStatusConditions(element, state);
                    }
                },
                (reference) => sourceStatusConditionsFromElement(reference.target),
            )
        ) {
            return;
        }

        editor.target.after(clone);
        this.content.reloadFrameDocument(clone);
    }

    moveEditor(source: Editor, target: Editor, position: "before" | "after"): void {
        if (source === target || source.target.contains(target.target)) {
            return;
        }
        if (!canMoveEditor(this.context.runtime(), source, target)) {
            return;
        }

        applySlot(source.target, target.target.getAttribute("slot") ?? undefined);
        applySiblingSourceStatus(source.target, sourceStatusConditionsFromElement(target.target));

        if (position === "before") {
            target.target.before(source.target);
        } else {
            target.target.after(source.target);
        }

        this.content.reloadFrameDocument(source.target);
    }

    private findNextSelectionTargetAfterDelete(editor: Editor): HTMLElement | null {
        const parent = editor.target.parentElement;
        if (!parent) {
            return null;
        }
        return this.context.runtime()?.getClosestEditor(parent)?.target ?? null;
    }
}

function applySiblingSourceStatus(target: HTMLElement, state: CmsSourceStatusCondition[]): void {
    if (state.length) {
        applySourceStatusConditions(target, state);
    } else if (sourceStatusConditionsFromElement(target).length) {
        target.removeAttribute(CMS_BINDING_ATTRIBUTES.condition);
    }
}
