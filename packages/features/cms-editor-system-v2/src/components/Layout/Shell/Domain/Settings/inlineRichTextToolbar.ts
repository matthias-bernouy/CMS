import { isSafeNavigationalUrl, type DataScope, type Editor } from "@bernouy/cms-content/editor";

import { DynamicDataPickerController } from "../../../../Controls/DynamicData/DynamicDataPickerController";
import type { RichTextAction } from "../../../../Controls/RichText/RichTextEditor/richTextActions";
import { RichTextRangeCommands } from "../../../../Controls/RichText/RichTextEditor/richTextRangeCommands";
import { renderRichTextToolbar } from "../../../../Controls/RichText/RichTextEditor/richTextToolbar";
import type { InlineRichTextRefs } from "../shellDomRefs";

type InlineRichTextToolbarContext = {
    dataScopes(editor: Editor): DataScope[];
    changed(editor: Editor): void;
};

export class InlineRichTextToolbar {
    private editor: Editor | null = null;
    private commands: RichTextRangeCommands | null = null;
    private readonly dataPicker: DynamicDataPickerController;

    constructor(
        private readonly refs: InlineRichTextRefs,
        private readonly context: InlineRichTextToolbarContext,
    ) {
        this.dataPicker = new DynamicDataPickerController(
            {
                picker: () => this.refs.picker,
                search: () => this.refs.search,
                list: () => this.refs.list,
                closeButton: () => this.refs.closeButton,
                rawScopes: () => JSON.stringify(this.editor ? this.context.dataScopes(this.editor) : []),
            },
            {
                saveSelection: () => this.commands?.saveSelection(),
                restoreSelection: () => this.commands?.restoreSelection(),
                insertText: (text) => this.commands?.insertText(text),
                focusControl: () => this.editor?.target.focus({ preventScroll: true }),
                finish: () => this.finishAction(),
            },
        );
    }

    activate(editor: Editor): void {
        this.deactivate();
        const capability = editor.getTextCapability();
        if (capability?.format !== "richtext") {
            return;
        }
        this.editor = editor;
        this.commands = new RichTextRangeCommands(
            () => editor.target,
            () => editor.target.ownerDocument.getSelection?.() ?? null,
        );
        renderRichTextToolbar(this.refs.toolbar, capability, {
            action: (action) => this.runAction(action),
            textSize: (direction) => this.runTextSize(direction),
        });
        this.refs.picker.hidden = true;
        this.refs.chrome.hidden = false;
        this.dataPicker.connect();
        this.updateListeners("addEventListener");
        this.updateSelection();
    }

    deactivate(): void {
        if (this.editor) {
            this.updateListeners("removeEventListener");
            this.dataPicker.disconnect();
        }
        this.editor = null;
        this.commands = null;
        this.refs.chrome.hidden = true;
        this.refs.picker.hidden = true;
        this.refs.toolbar.replaceChildren();
    }

    contains(target: Node | null): boolean {
        return Boolean(target && this.refs.chrome.contains(target));
    }

    preservesFocusOut(target: Node | null): boolean {
        return this.contains(target) || !this.refs.picker.hidden;
    }

    insertPlainText(text: string): boolean {
        if (!this.editor || !this.commands) {
            return false;
        }
        this.commands.saveSelection();
        this.commands.insertText(text);
        this.finishAction();
        return true;
    }

    private runAction(action: RichTextAction): void {
        if (!this.commands || (action !== "dynamic" && !this.commands.hasSelectedRange())) {
            return;
        }
        if (action === "dynamic") {
            this.dataPicker.open();
            return;
        }
        if (action === "bold") {
            this.commands.toggleRange("strong");
        } else if (action === "italic") {
            this.commands.toggleRange("em");
        } else if (action === "underline") {
            this.commands.toggleRange("u");
        } else if (action === "code") {
            this.commands.toggleRange("code");
        } else if (this.commands.unwrapMatchingRange("a")) {
            this.finishAction();
            return;
        } else {
            const href = this.refs.chrome.ownerDocument.defaultView?.prompt("Link URL")?.trim();
            if (href && isSafeNavigationalUrl(href)) {
                this.commands.wrapRange("a", { href });
            }
        }
        this.finishAction();
    }

    private runTextSize(direction: "decrease" | "increase"): void {
        if (this.commands?.stepTextSize(direction)) {
            this.finishAction();
        }
    }

    private finishAction(): void {
        const editor = this.editor;
        if (!editor || !this.commands) {
            return;
        }
        editor.target.focus({ preventScroll: true });
        this.commands.restoreSelection();
        this.context.changed(editor);
        this.position();
    }

    private readonly updateSelection = (): void => {
        this.commands?.saveSelection();
        this.position();
    };

    private readonly position = (): void => {
        const editor = this.editor;
        if (!editor || this.refs.chrome.hidden) {
            return;
        }
        const anchor = selectionRect(editor) ?? editor.target.getBoundingClientRect();
        const frame = editor.target.ownerDocument.defaultView?.frameElement;
        const frameRect = frame?.getBoundingClientRect();
        const toolbarRect = this.refs.chrome.getBoundingClientRect();
        const outerView = this.refs.chrome.ownerDocument.defaultView;
        const viewportWidth = outerView?.innerWidth || 1024;
        const frameLeft = frameRect?.left ?? 0;
        const frameTop = frameRect?.top ?? 0;
        const left = clamp(
            frameLeft + anchor.left + anchor.width / 2 - toolbarRect.width / 2,
            8,
            viewportWidth - toolbarRect.width - 8,
        );
        const above = frameTop + anchor.top - toolbarRect.height - 8;
        this.refs.chrome.style.left = `${left}px`;
        this.refs.chrome.style.top = `${above >= 8 ? above : frameTop + anchor.bottom + 8}px`;
    };

    private updateListeners(method: "addEventListener" | "removeEventListener"): void {
        const frameDocument = this.editor!.target.ownerDocument;
        const frameView = frameDocument.defaultView;
        const outerView = this.refs.chrome.ownerDocument.defaultView;
        frameDocument[method]("selectionchange", this.updateSelection);
        frameView?.[method]("scroll", this.position, true);
        frameView?.[method]("resize", this.position);
        outerView?.[method]("scroll", this.position, true);
        outerView?.[method]("resize", this.position);
    }
}

function selectionRect(editor: Editor): DOMRect | null {
    const selection = editor.target.ownerDocument.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }
    const range = selection.getRangeAt(0);
    if (!editor.target.contains(range.commonAncestorContainer)) {
        return null;
    }
    return (range as Range & { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect?.() ?? null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(Math.max(min, max), value));
}
