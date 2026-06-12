import type { Editor } from "@bernouy/cms-content/editor";

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

    getDirectChildren(parent: HTMLElement): Editor[] {
        const children: Editor[] = [];

        for (const editor of this._editorsByTarget.values()) {
            if (editor.target === parent) continue;
            if (!parent.contains(editor.target)) continue;
            if (this._getClosestRegisteredAncestor(editor.target) !== parent) continue;

            children.push(editor);
        }

        return children;
    }

    private _getClosestRegisteredAncestor(target: HTMLElement): HTMLElement | undefined {
        let current = target.parentElement;

        while (current) {
            if (this._editorsByTarget.has(current)) return current;
            current = current.parentElement;
        }

        return undefined;
    }

}
