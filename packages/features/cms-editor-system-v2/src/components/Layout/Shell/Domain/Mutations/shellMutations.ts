import {
    type Editor,
    type EditorDocument,
} from "@bernouy/cms-content/editor";

import type { EditorRuntime, EditorDataSource, SourceStateName } from "../../../../../runtime";
import type { StructureTreeActionDetail } from "../../../StructureTree/StructureTree";
import type { RepeatPicker } from "../../../RepeatPicker/RepeatPicker";
import type { BlockPickerItem } from "../../../BlockPickerModal/BlockPickerModal";
import type { SourceBinding } from "./sourceBindings";
import { ShellContentMutations } from "./shellContentMutations";
import { ShellEditorMutations } from "./shellEditorMutations";
import { ShellBindingMutations } from "./shellBindingMutations";

export type MutationContext = {
    frameDocument(): Document | null;
    editorDocument(): EditorDocument | null;
    runtime(): EditorRuntime | null;
    insertItems(): BlockPickerItem[];
    repeatPicker(): RepeatPicker;
    findStructureNodeLabel(editor: Editor): string | null;
    isEmptyDocumentContent(): boolean;
    loadDocument(document: EditorDocument, selectedTarget?: HTMLElement | null): void;
    syncViewFrameContent(): void;
};

export class ShellMutations {
    private readonly content: ShellContentMutations;
    private readonly editor: ShellEditorMutations;
    private readonly bindings: ShellBindingMutations;

    constructor(context: MutationContext) {
        this.content = new ShellContentMutations(context);
        this.editor = new ShellEditorMutations(context, this.content);
        this.bindings = new ShellBindingMutations(context);
    }

    handleStructureAction(detail: StructureTreeActionDetail): void {
        const { action, editor, entry, item, sourceEditor, sourceState } = detail;
        const blockItem = item ?? (entry ? { kind: "block" as const, entry } : null);
        if (action === "duplicate" && editor) this.editor.duplicateEditor(editor);
        else if (action === "delete" && editor) this.editor.deleteEditor(editor);
        else if (action === "copy" && editor) this.editor.copyEditor(editor);
        else if (action === "paste-after") this.editor.pasteAfter(editor ?? null, sourceState);
        else if (action === "set-source" && editor && detail.dataSource) this.bindings.setSource(editor, detail.dataSource, detail.sourceBinding);
        else if (action === "remove-source" && editor) this.bindings.removeSource(editor);
        else if (action === "configure-repeat" && editor) this.bindings.openRepeatPicker(editor);
        else if (action === "remove-repeat" && editor) this.bindings.removeRepeat(editor);
        else if (action === "clear-source-state" && editor && sourceState) this.editor.clearSourceState(editor, sourceState);
        else if ((action === "move-before" || action === "move-after") && editor && sourceEditor) {
            this.editor.moveEditor(sourceEditor, editor, action === "move-before" ? "before" : "after");
        } else if (action === "replace" && editor && blockItem) this.content.replaceEditor(editor, blockItem, detail.slot);
        else if (action === "add-root" && blockItem) this.content.addRoot(blockItem);
        else if (action === "add-source-state-child" && editor && blockItem && sourceState) {
            this.content.addSourceStateChild(editor, blockItem, sourceState);
        } else if (editor && blockItem) this.content.addChild(editor, blockItem, detail.slot);
    }

    applyRepeatSelection(path: string, alias: string): void {
        this.bindings.applyRepeatSelection(path, alias);
    }

    addChild(parent: Editor, item: BlockPickerItem, slotName?: string): void {
        this.content.addChild(parent, item, slotName);
    }

    addRoot(item: BlockPickerItem): void {
        this.content.addRoot(item);
    }

    replaceEditor(editor: Editor, item: BlockPickerItem, slotName?: string): void {
        this.content.replaceEditor(editor, item, slotName);
    }

    addSourceStateChild(parent: Editor, item: BlockPickerItem, sourceState: SourceStateName): void {
        this.content.addSourceStateChild(parent, item, sourceState);
    }

    setRepeat(editor: Editor, path: string, alias: string): void {
        this.bindings.setRepeat(editor, path, alias);
    }

    setSource(editor: Editor, source: EditorDataSource, binding: SourceBinding = { url: source.url }): void {
        this.bindings.setSource(editor, source, binding);
    }

    removeSource(editor: Editor): void {
        this.bindings.removeSource(editor);
    }
}
