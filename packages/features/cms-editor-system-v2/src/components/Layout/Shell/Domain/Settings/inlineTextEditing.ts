import type { Editor } from "@bernouy/cms-content/editor";

import type { StructureNode } from "../../../../../runtime";

import type { InlineRichTextToolbar } from "./inlineRichTextToolbar";

export const INLINE_TEXT_EDITABLE_ATTRIBUTE = "data-cms-editor-v2-inline-text-editable";
export const INLINE_TEXT_ACTIVE_ATTRIBUTE = "data-cms-editor-v2-inline-text-active";
export const INLINE_TEXT_PROTECTED_ATTRIBUTE = "data-cms-editor-v2-inline-text-protected";

const INLINE_TEXT_STYLE_ID = "cms-editor-v2-inline-text-style";

export class InlineTextEditing {
    private activeEditor: Editor | null = null;
    private readonly markedTargets = new Set<HTMLElement>();
    private readonly protectedTargets = new Set<HTMLElement>();

    constructor(private readonly richTextToolbar?: InlineRichTextToolbar) {}

    refresh(structure: StructureNode[]): void {
        this.reset();
        this.markStructure(structure);
    }

    start(editor: Editor, focus = false): boolean {
        if (this.activeEditor === editor) {
            if (focus) {
                editor.target.focus({ preventScroll: true });
            }
            return true;
        }
        const format = inlineTextFormat(editor);
        if (!format) {
            this.stop();
            return false;
        }
        this.stop();
        this.activeEditor = editor;
        editor.target.setAttribute(INLINE_TEXT_ACTIVE_ATTRIBUTE, "");
        editor.target.setAttribute("contenteditable", format === "richtext" ? "true" : "plaintext-only");
        this.protectContentSlots(editor);
        this.richTextToolbar?.activate(editor);
        if (focus) {
            editor.target.focus({ preventScroll: true });
        }
        return true;
    }

    isActive(editor: Editor | null): boolean {
        return this.activeEditor === editor;
    }

    activeEditorFor(event: Event): Editor | null {
        const editor = this.activeEditor;
        const target = eventNode(event.target);
        return editor && target && editor.target.contains(target) ? editor : null;
    }

    activeFormatFor(event: Event): "text" | "richtext" | null {
        const editor = this.activeEditorFor(event);
        return editor?.getTextCapability()?.format ?? null;
    }

    preservesFocusOut(target: Node | null): boolean {
        return this.richTextToolbar?.preservesFocusOut(target) ?? false;
    }

    insertPastedText(event: Event, text: string): boolean {
        return this.activeFormatFor(event) === "richtext" && Boolean(this.richTextToolbar?.insertPlainText(text));
    }

    stopUnless(editor: Editor | null): void {
        if (this.activeEditor !== editor) {
            this.stop();
        }
    }

    stop(blur = false): void {
        const editor = this.activeEditor;
        if (!editor) {
            return;
        }
        this.activeEditor = null;
        this.richTextToolbar?.deactivate();
        editor.target.removeAttribute("contenteditable");
        editor.target.removeAttribute(INLINE_TEXT_ACTIVE_ATTRIBUTE);
        for (const target of this.protectedTargets) {
            target.removeAttribute("contenteditable");
            target.removeAttribute(INLINE_TEXT_PROTECTED_ATTRIBUTE);
        }
        this.protectedTargets.clear();
        if (blur && editor.target.ownerDocument.activeElement === editor.target) {
            editor.target.blur();
        }
    }

    reset(): void {
        this.stop();
        for (const target of this.markedTargets) {
            target.removeAttribute(INLINE_TEXT_EDITABLE_ATTRIBUTE);
        }
        this.markedTargets.clear();
    }

    private markStructure(nodes: StructureNode[]): void {
        for (const node of nodes) {
            const format = inlineTextFormat(node.editor);
            if (format) {
                node.target.setAttribute(INLINE_TEXT_EDITABLE_ATTRIBUTE, format);
                this.markedTargets.add(node.target);
            }
            this.markStructure(node.children);
        }
    }

    private protectContentSlots(editor: Editor): void {
        const reserved = reservedSlotNames(editor);
        for (const child of Array.from(editor.target.children)) {
            if (!reserved.has(child.getAttribute("slot") ?? "")) {
                continue;
            }
            const target = child as HTMLElement;
            target.setAttribute("contenteditable", "false");
            target.setAttribute(INLINE_TEXT_PROTECTED_ATTRIBUTE, "");
            this.protectedTargets.add(target);
        }
    }
}

export function injectInlineTextEditingStyle(document: Document): void {
    if (document.getElementById(INLINE_TEXT_STYLE_ID)) {
        return;
    }
    const style = document.createElement("style");
    style.id = INLINE_TEXT_STYLE_ID;
    style.textContent = `
        [${INLINE_TEXT_EDITABLE_ATTRIBUTE}] { cursor: text; }
        [${INLINE_TEXT_EDITABLE_ATTRIBUTE}]:hover {
            outline: 1px dashed rgba(55, 125, 255, 0.65);
            outline-offset: 2px;
        }
        [${INLINE_TEXT_ACTIVE_ATTRIBUTE}] { caret-color: rgb(55, 125, 255); }
    `;
    (document.head ?? document.documentElement).append(style);
}

export function stripInlineTextEditingState(root: HTMLElement): void {
    const selector = `[${INLINE_TEXT_EDITABLE_ATTRIBUTE}], [${INLINE_TEXT_ACTIVE_ATTRIBUTE}], [${INLINE_TEXT_PROTECTED_ATTRIBUTE}]`;
    const descendants = Array.from(root.querySelectorAll<HTMLElement>(selector));
    const targets = root.matches(selector) ? [root, ...descendants] : descendants;
    for (const target of targets) {
        if (target.hasAttribute(INLINE_TEXT_ACTIVE_ATTRIBUTE)) {
            target.removeAttribute("contenteditable");
        }
        if (target.hasAttribute(INLINE_TEXT_PROTECTED_ATTRIBUTE)) {
            target.removeAttribute("contenteditable");
        }
        target.removeAttribute(INLINE_TEXT_EDITABLE_ATTRIBUTE);
        target.removeAttribute(INLINE_TEXT_ACTIVE_ATTRIBUTE);
        target.removeAttribute(INLINE_TEXT_PROTECTED_ATTRIBUTE);
    }
}

function inlineTextFormat(editor: Editor): "text" | "richtext" | null {
    const format = editor.getTextCapability()?.format;
    const slots = editor.getContentSlots();
    if (
        (format !== "text" && format !== "richtext") ||
        slots.some((slot) => !slot.slot) ||
        editor.getStructureMode() === "opaque" ||
        editor.target.hasAttribute("contenteditable")
    ) {
        return null;
    }
    const reserved = reservedSlotNames(editor);
    const reservedChildren = Array.from(editor.target.children).filter((child) =>
        reserved.has(child.getAttribute("slot") ?? ""),
    );
    if (reservedChildren.some((child) => child.hasAttribute("contenteditable"))) {
        return null;
    }
    if (format === "text") {
        const hasEditableMarkup = Array.from(editor.target.children).some(
            (child) => !reserved.has(child.getAttribute("slot") ?? ""),
        );
        if (hasEditableMarkup) {
            return null;
        }
    }
    return format;
}

function reservedSlotNames(editor: Editor): Set<string> {
    return new Set(editor.getContentSlots().flatMap((slot) => (slot.slot ? [slot.slot] : [])));
}

function eventNode(target: EventTarget | null): Node | null {
    return target && "nodeType" in target ? (target as Node) : null;
}
