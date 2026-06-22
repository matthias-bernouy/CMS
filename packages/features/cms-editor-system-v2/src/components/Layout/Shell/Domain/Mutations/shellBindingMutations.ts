import {
    CMS_BINDING_CORE_TAG,
    type Editor,
} from "@bernouy/cms-content/editor";

import type { EditorDataSource } from "../../../../../runtime";
import type { MutationContext } from "./shellMutations";
import {
    confirmRemoveSourceDependents,
    removeRepeat,
    removeSource,
    setRepeat,
    setSource,
    type SourceBinding,
} from "./sourceBindings";

export class ShellBindingMutations {
    private _pendingRepeatEditor: Editor | null = null;

    constructor(private readonly context: MutationContext) {}

    setSource(editor: Editor, source: EditorDataSource, binding: SourceBinding = { url: source.url }): void {
        setSource(editor, source, binding);
        this.reload(editor.target);
    }

    removeSource(editor: Editor): void {
        if (!removeSource(editor, confirmRemoveSourceDependents)) return;
        this.reload(editor.target);
    }

    openRepeatPicker(editor: Editor): void {
        const runtime = this.context.runtime();
        if (!runtime) return;

        this._pendingRepeatEditor = editor;
        runtime.select(editor);
        this.context.repeatPicker().open(
            runtime.getSelectedDataScopes(),
            this.context.findStructureNodeLabel(editor) ?? editor.target.localName,
        );
    }

    applyRepeatSelection(path: string, alias: string): void {
        if (!this._pendingRepeatEditor) return;
        this.setRepeat(this._pendingRepeatEditor, path, alias);
        this._pendingRepeatEditor = null;
    }

    removeRepeat(editor: Editor): void {
        removeRepeat(editor);
        this.reload(editor.target);
    }

    setRepeat(editor: Editor, path: string, alias: string): void {
        setRepeat(editor, path, alias);
        this.reload(editor.target);
    }

    private reload(selectedTarget: HTMLElement): void {
        const frameDocument = this.context.frameDocument();
        if (!frameDocument) return;

        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")
            ?? frameDocument.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG);
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]");
        if (!root || !contentRoot) return;

        this.context.loadDocument({ root, contentRoot }, selectedTarget);
        this.context.syncViewFrameContent();
    }
}
