import type { Editor } from "@bernouy/cms-content/editor";

import type { FrameHighlight } from "../Core/FrameHighlight";
import type { ShellCommands } from "../Core/shellCommands";
import type { ShellState } from "../Core/Services/shellState";
import { eventElement } from "../shellFrames";
import type { InlineTextEditing } from "../../Domain/Settings/inlineTextEditing";
import { sanitizeNativeRichTextEditor } from "../../../../../native/richTextPolicy";

type InlineTextEventsContext = {
    state: ShellState;
    commands: ShellCommands;
    highlight: FrameHighlight;
    inlineText: InlineTextEditing;
};

export class ShellInlineTextEvents {
    constructor(private readonly context: InlineTextEventsContext) {}

    readonly onFramePointerDown = (event: Event): void => {
        const editor = this.editorFor(event);
        if (!editor || this.context.state.editorMode !== "edit" || !this.context.inlineText.start(editor)) {
            this.context.inlineText.stop();
            return;
        }
        if (this.context.state.runtime?.getSelection()?.editor !== editor) {
            this.context.commands.select(editor, { scrollStructureIntoView: true });
        }
    };

    readonly onFrameClick = (event: Event): void => {
        const runtime = this.context.state.runtime;
        if (!runtime) {
            return;
        }
        event.preventDefault();
        const editor = this.editorFor(event);
        if (editor && this.context.state.editorMode === "edit") {
            this.context.inlineText.start(editor, !this.context.inlineText.isActive(editor));
        } else {
            this.context.inlineText.stop();
        }
        if (runtime.getSelection()?.editor !== editor) {
            this.context.commands.select(editor, { scrollStructureIntoView: true });
        }
    };

    readonly onFrameInput = (event: Event): void => {
        const editor = this.context.inlineText.activeEditorFor(event);
        if (!editor) {
            return;
        }
        sanitizeNativeRichTextEditor(editor);
        this.context.commands.renderSettings();
        this.context.commands.syncViewFrameContent();
        this.context.highlight.show(editor);
    };

    readonly onFramePaste = (event: Event): void => {
        const text = (event as ClipboardEvent).clipboardData?.getData("text/plain");
        if (text === undefined || !this.context.inlineText.insertPastedText(event, text)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
    };

    readonly onFrameKeyDown = (event: Event): void => {
        const format = this.context.inlineText.activeFormatFor(event);
        if (!format) {
            return;
        }
        const key = (event as KeyboardEvent).key;
        if (key !== "Escape" && (key !== "Enter" || format === "richtext")) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.context.inlineText.stop(true);
    };

    readonly onFrameFocusOut = (event: Event): void => {
        const editor = this.context.inlineText.activeEditorFor(event);
        if (!editor) {
            return;
        }
        const relatedTarget = eventNode((event as FocusEvent).relatedTarget);
        if (
            (relatedTarget && editor.target.contains(relatedTarget)) ||
            this.context.inlineText.preservesFocusOut(relatedTarget)
        ) {
            return;
        }
        this.context.inlineText.stop();
    };

    private editorFor(event: Event): Editor | null {
        return this.context.state.runtime?.getClosestEditor(eventElement(event)) ?? null;
    }
}

function eventNode(target: EventTarget | null): Node | null {
    return target && "nodeType" in target ? (target as Node) : null;
}
