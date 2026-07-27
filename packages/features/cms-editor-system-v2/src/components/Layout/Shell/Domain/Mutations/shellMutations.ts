import { type Editor, type EditorCatalog, type EditorDocument, type CmsSourceState } from "@bernouy/cms-content/editor";

import type { EditorRuntime, EditorDataSource } from "../../../../../runtime";
import type { StructureTreeActionDetail } from "../../../StructureTree/StructureTree";
import type { RepeatPicker } from "../../../Pickers/RepeatPicker/RepeatPicker";
import type { BlockPickerItem } from "../../../Pickers/BlockPickerModal/BlockPickerModal";
import type { SourceBinding } from "./Bindings/sourceBindings";
import { ShellContentMutations } from "./Content/shellContentMutations";
import { ShellEditorMutations } from "./shellEditorMutations";
import { ShellBindingMutations } from "./shellBindingMutations";
import {
    isInsertionItemAllowed,
    type ResolvedEditorInteractionPolicy,
} from "../../../../../policy/editorInteractionPolicy";

export type MutationContext = {
    frameDocument(): Document | null;
    editorDocument(): EditorDocument | null;
    runtime(): EditorRuntime | null;
    catalog(): EditorCatalog;
    rootEditor?(): Editor | null;
    insertItems(): BlockPickerItem[];
    editingPolicy(): ResolvedEditorInteractionPolicy;
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

    constructor(private readonly context: MutationContext) {
        this.content = new ShellContentMutations(context);
        this.editor = new ShellEditorMutations(context);
        this.bindings = new ShellBindingMutations(context);
    }

    handleStructureAction(detail: StructureTreeActionDetail): void {
        const { action, editor, entry, item, sourceEditor, sourceState } = detail;
        const blockItem = item ?? (entry ? { kind: "block" as const, entry } : null);
        if (blockItem && !isInsertionItemAllowed(this.context.editingPolicy(), blockItem)) {
            return;
        }
        if (action === "duplicate" && editor) {
            this.editor.duplicateEditor(editor);
        } else if (action === "delete" && editor) {
            this.editor.deleteEditor(editor);
        } else if (action === "copy" && editor) {
            this.editor.copyEditor(editor);
        } else if (action === "paste-after") {
            this.editor.pasteAfter(editor ?? null);
        } else if (action === "set-source" && editor && detail.dataSource && this.canUseBindings()) {
            this.bindings.setSource(editor, detail.dataSource, detail.sourceBinding);
        } else if (action === "remove-source" && editor && this.canUseBindings()) {
            this.bindings.removeSource(editor);
        } else if (action === "configure-repeat" && editor && this.canUseRepeats()) {
            this.bindings.openRepeatPicker(editor);
        } else if (action === "remove-repeat" && editor && this.canUseRepeats()) {
            this.bindings.removeRepeat(editor);
        } else if (action === "set-condition" && editor && detail.conditionExpression && this.canUseConditions()) {
            this.bindings.setCondition(editor, detail.conditionExpression);
        } else if (
            action === "set-source-status-condition" &&
            editor &&
            sourceEditor &&
            sourceState &&
            this.canUseConditions()
        ) {
            this.bindings.setSourceStatusCondition(editor, sourceEditor, sourceState);
        } else if (
            action === "set-source-status-conditions" &&
            editor &&
            detail.sourceConditions &&
            this.canUseConditions()
        ) {
            this.bindings.setSourceStatusConditions(editor, detail.sourceConditions);
        } else if (action === "remove-source-status-condition" && editor && this.canUseConditions()) {
            this.bindings.removeSourceStatusCondition(editor);
        } else if ((action === "move-before" || action === "move-after") && editor && sourceEditor) {
            this.editor.moveEditor(sourceEditor, editor, action === "move-before" ? "before" : "after");
        } else if (action === "replace" && editor && blockItem) {
            this.content.replaceEditor(editor, blockItem, detail.slot);
        } else if (action === "add-root" && blockItem) {
            this.content.addRoot(blockItem, detail.slot);
        } else if (editor && blockItem) {
            this.content.addChild(editor, blockItem, detail.slot);
        }
    }

    applyRepeatSelection(path: string, alias: string): void {
        if (this.canUseRepeats()) {
            this.bindings.applyRepeatSelection(path, alias);
        }
    }

    addChild(parent: Editor, item: BlockPickerItem, slotName?: string): void {
        if (isInsertionItemAllowed(this.context.editingPolicy(), item)) {
            this.content.addChild(parent, item, slotName);
        }
    }

    addRoot(item: BlockPickerItem, slotName?: string): void {
        if (isInsertionItemAllowed(this.context.editingPolicy(), item)) {
            this.content.addRoot(item, slotName);
        }
    }

    replaceEditor(editor: Editor, item: BlockPickerItem, slotName?: string): void {
        if (isInsertionItemAllowed(this.context.editingPolicy(), item)) {
            this.content.replaceEditor(editor, item, slotName);
        }
    }

    setRepeat(editor: Editor, path: string, alias: string): void {
        if (this.canUseRepeats()) {
            this.bindings.setRepeat(editor, path, alias);
        }
    }

    setSource(editor: Editor, source: EditorDataSource, binding: SourceBinding = { url: source.url }): void {
        if (this.canUseBindings()) {
            this.bindings.setSource(editor, source, binding);
        }
    }

    removeSource(editor: Editor): void {
        if (this.canUseBindings()) {
            this.bindings.removeSource(editor);
        }
    }

    setSourceStatusCondition(editor: Editor, sourceEditor: Editor, state: CmsSourceState): void {
        if (this.canUseConditions()) {
            this.bindings.setSourceStatusCondition(editor, sourceEditor, state);
        }
    }

    setCondition(editor: Editor, expression: string): void {
        if (this.canUseConditions()) {
            this.bindings.setCondition(editor, expression);
        }
    }

    setSourceStatusConditions(
        editor: Editor,
        conditions: Array<{ sourceEditor: Editor; sourceState: CmsSourceState }>,
    ): void {
        if (this.canUseConditions()) {
            this.bindings.setSourceStatusConditions(editor, conditions);
        }
    }

    removeSourceStatusCondition(editor: Editor): void {
        if (this.canUseConditions()) {
            this.bindings.removeSourceStatusCondition(editor);
        }
    }

    private canUseBindings(): boolean {
        return this.context.editingPolicy().bindings;
    }

    private canUseRepeats(): boolean {
        const policy = this.context.editingPolicy();
        return policy.bindings && policy.repeats;
    }

    private canUseConditions(): boolean {
        const policy = this.context.editingPolicy();
        return policy.bindings && policy.conditions;
    }
}
