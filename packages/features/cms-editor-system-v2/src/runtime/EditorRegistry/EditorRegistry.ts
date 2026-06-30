import type {
    DataScope,
    Editor,
} from "@bernouy/cms-content/editor";

export class EditorRegistry {

    private readonly _editorsByTarget = new Map<HTMLElement, Editor>();

    register(editor: Editor): void {
        const current = this._editorsByTarget.get(editor.target);
        if (current && current !== editor) {
            throw new Error("An editor is already registered for this element.");
        }
        this._editorsByTarget.set(editor.target, editor);
    }

    unregister(editor: Editor): void {
        if (this._editorsByTarget.get(editor.target) === editor) {
            this._editorsByTarget.delete(editor.target);
        }
    }

    getEditor(target: HTMLElement): Editor | undefined {
        return this._editorsByTarget.get(target);
    }

    getClosestEditor(target: Element | null, stopAt?: HTMLElement): Editor | undefined {
        let current: Element | null = target;

        while (current) {
            const editor = this._editorsByTarget.get(current as HTMLElement);
            if (editor) return editor;
            if (stopAt && current === stopAt) return undefined;
            current = current.parentElement;
        }

        return undefined;
    }

    getRichTextOwner(target: HTMLElement): Editor | undefined {
        let current = target.parentElement;

        while (current) {
            const editor = this._editorsByTarget.get(current);
            if (editor && this._containsTargetInRichText(editor, target)) return editor;
            current = current.parentElement;
        }

        return undefined;
    }

    getDirectChildren(parent: HTMLElement): Editor[] {
        const children: Editor[] = [];

        for (const editor of this._editorsByTarget.values()) {
            if (editor.target === parent) continue;
            if (this.getRichTextOwner(editor.target)) continue;
            if (!parent.contains(editor.target)) continue;
            if (this._getClosestRegisteredAncestor(editor.target) !== parent) continue;

            children.push(editor);
        }

        return children;
    }

    getAncestors(target: HTMLElement): Editor[] {
        const ancestors: Editor[] = [];
        let current = target.parentElement;

        while (current) {
            const editor = this._editorsByTarget.get(current);
            if (editor) ancestors.unshift(editor);
            current = current.parentElement;
        }

        return ancestors;
    }

    collectDataScopes(target: HTMLElement, options: { includeTarget?: boolean } = {}): DataScope[] {
        const editors = [
            ...this.getAncestors(target),
            options.includeTarget === false ? undefined : this.getEditor(target),
        ].filter((editor): editor is Editor => Boolean(editor));

        return editors.flatMap(editor => editor.getDataScopes());
    }

    private _getClosestRegisteredAncestor(target: HTMLElement): HTMLElement | undefined {
        let current = target.parentElement;

        while (current) {
            const editor = this._editorsByTarget.get(current);
            if (editor && !this.getRichTextOwner(editor.target)) return current;
            current = current.parentElement;
        }

        return undefined;
    }

    private _containsTargetInRichText(editor: Editor, target: HTMLElement): boolean {
        return editor.getTextCapability()?.format === "richtext"
            && editor.target !== target
            && editor.target.contains(target)
            && !this._isInsideNamedContentSlot(editor, target);
    }

    private _isInsideNamedContentSlot(editor: Editor, target: HTMLElement): boolean {
        const namedSlots = new Set(editor.getContentSlots()
            .map(slot => slot.slot)
            .filter((slot): slot is string => Boolean(slot)));
        if (namedSlots.size === 0) return false;

        let current: HTMLElement | null = target;
        while (current && current !== editor.target) {
            const slot = current.getAttribute("slot");
            if (slot && namedSlots.has(slot)) return true;
            current = current.parentElement;
        }

        return false;
    }

}
