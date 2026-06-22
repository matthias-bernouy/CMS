import {
    applySourceState,
    CMS_BINDING_ATTRIBUTES,
    sourceStateFromElement,
    type Editor,
} from "@bernouy/cms-content/editor";

import type { SourceStateName } from "../../../../../runtime";
import type { MutationContext } from "./shellMutations";
import type { ShellContentMutations } from "./shellContentMutations";
import {
    applySlot,
} from "./insertion";
import {
    canDelete,
    canDuplicate,
    canInsertSibling,
    canMoveEditor,
} from "./slots";

export class ShellEditorMutations {
    private _clipboardElement: HTMLElement | null = null;

    constructor(
        private readonly context: MutationContext,
        private readonly content: ShellContentMutations,
    ) {}

    duplicateEditor(editor: Editor): void {
        if (!canDuplicate(this.context.runtime(), editor)) return;

        const clone = editor.target.cloneNode(true) as HTMLElement;
        editor.target.after(clone);
        this.content.reloadFrameDocument(clone);
    }

    deleteEditor(editor: Editor): void {
        if (!canDelete(this.context.runtime(), editor)) return;

        const nextSelectionTarget = this.findNextSelectionTargetAfterDelete(editor);
        editor.target.remove();
        this.content.reloadFrameDocument(nextSelectionTarget);
    }

    copyEditor(editor: Editor): void {
        this._clipboardElement = editor.target.cloneNode(true) as HTMLElement;
    }

    pasteAfter(editor: Editor | null, sourceState?: SourceStateName): void {
        const document = this.context.editorDocument();
        if (!this._clipboardElement || !document) return;

        const clone = this._clipboardElement.cloneNode(true) as HTMLElement;
        if (!editor) {
            document.contentRoot.append(clone);
            this.content.reloadFrameDocument(clone);
            return;
        }

        if (sourceState) {
            applySourceState(clone, sourceState);
            editor.target.append(clone);
            this.content.reloadFrameDocument(clone);
            return;
        }

        if (!canInsertSibling(
            this.context.runtime(),
            editor,
            clone,
            (element, state) => applySourceState(element, state ?? "loaded"),
            reference => sourceStateFromElement(reference.target),
        )) return;

        editor.target.after(clone);
        this.content.reloadFrameDocument(clone);
    }

    clearSourceState(parent: Editor, sourceState: SourceStateName): void {
        if (sourceState === "loaded") {
            for (const child of Array.from(parent.target.children)) {
                if (!child.hasAttribute(CMS_BINDING_ATTRIBUTES.slot)) child.remove();
            }
            this.content.reloadFrameDocument(parent.target);
            return;
        }

        for (const child of Array.from(parent.target.children)) {
            if (child.getAttribute(CMS_BINDING_ATTRIBUTES.slot) === sourceState) child.remove();
        }
        this.content.reloadFrameDocument(parent.target);
    }

    moveEditor(source: Editor, target: Editor, position: "before" | "after"): void {
        if (source === target || source.target.contains(target.target)) return;
        if (!canMoveEditor(this.context.runtime(), source, target)) return;

        applySlot(source.target, target.target.getAttribute("slot") ?? undefined);
        applySourceState(source.target, sourceStateFromElement(target.target));

        if (position === "before") target.target.before(source.target);
        else target.target.after(source.target);

        this.content.reloadFrameDocument(source.target);
    }

    private findNextSelectionTargetAfterDelete(editor: Editor): HTMLElement | null {
        const parent = editor.target.parentElement;
        if (!parent) return null;
        return this.context.runtime()?.getClosestEditor(parent)?.target ?? null;
    }
}
