import { BlocLibrary } from "src/control/components/editor/EditorSystem/BlocLibrary/BlocLibrary";
import { Editor } from "../Editor/Editor";
import getClosestEditorSystem from "../../dom/editor/getClosestEditorSystem";
import type { EDITOR_SYSTEM_MODE } from "types/w13c/EditorSystem";

const cssStyle = `
:is(h1, h2, h3, h4, h5, h6, p, span, blockquote, a):empty::before {
    content: attr(p9r-text-placeholder);
    color: var(--text-muted, #aaa);
    pointer-events: none;
    display: block;
    font-style: italic;
    font-weight: 300;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
    :is(h1, h2, h3, h4, h5, h6, p, span, blockquote):empty {
        display: flex
    }
`

export const textTags = new Set(["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "a", "b", "i", "u"]);

export type TextEditorOptions = {
    createBloc: boolean;
    writingRichText: boolean;
    writingText: boolean;
    deleteSelf: boolean;
}

export class TextEditor extends Editor {
    private onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    private onInput = (e: Event) => this.handleInput(e);
    private onPaste = (e: ClipboardEvent) => this.handlePaste(e);
    private isInitializing = false;

    constructor(target: HTMLElement) {
        super(target, cssStyle);
        this.observeAttributes();
    }

    private attrObserver?: MutationObserver;

    observeAttributes(){
        this.attrObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName?.startsWith('p9r-')) {
                    if ( getClosestEditorSystem(this.target).mode === "editor" ){
                        if ( !this.isInitializing ){
                            this.isInitializing = true;
                            this.init();
                        }
                    }
                }
            }
        });
    }

    public override onSwitchMode(mode: EDITOR_SYSTEM_MODE) {
        super.onSwitchMode(mode);
        if (!this.attrObserver) return;
        if (mode === "editor") {
            this.attrObserver.observe(this.target, {
                attributes: true,
                attributeFilter: [p9r.attr.TEXT.BLOC_MANAGEMENT, p9r.attr.TEXT.EDITABLE],
            });
        } else {
            this.isInitializing = false;
            this.attrObserver.disconnect();
        }
    }

    private handlePaste(e: ClipboardEvent) {
        e.preventDefault();
        const text = e.clipboardData?.getData("text/plain") || "";

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        selection.deleteFromDocument();
        const textNode = document.createTextNode(text);

        const range = selection.getRangeAt(0);
        range.insertNode(textNode);

        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    private static _editorAttrs = new Set([
        'contenteditable', 'tabindex', 'draggable',
    ]);

    private createElement(tag: string){
        const element = document.createElement(tag) as HTMLElement;
        Array.from(this.target.attributes).forEach(attr => {
            if (attr.name.startsWith('p9r-')) return;
            if (attr.name === 'class') return;
            if (TextEditor._editorAttrs.has(attr.name)) return;
            element.setAttribute(attr.name, attr.value);
        });
        const parentId = this.target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (parentId) element.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
        element.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
        return element;
    }

    private handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            if (e.shiftKey) return;
            e.preventDefault();
            e.stopImmediatePropagation()

            if (this.isAddAfterDisabled) return;

            const nextEl = this.createElement("p")
            nextEl.contentEditable = "true";
            nextEl.tabIndex = 0;

            const sel = window.getSelection();
            if (sel && sel.rangeCount && sel.anchorNode && this.target.contains(sel.anchorNode) && this.target.lastChild) {
                const range = sel.getRangeAt(0);
                if (!range.collapsed) range.deleteContents();
                const tail = range.cloneRange();
                tail.setEndAfter(this.target.lastChild);
                const fragment = tail.extractContents();
                nextEl.appendChild(fragment);
            }

            this.target.after(nextEl)
            const observer = getClosestEditorSystem(this.target).observer;
            if (observer) {
                observer.make_it_editor(nextEl);
            } else {
                const e = new TextEditor(nextEl);
                e.viewEditor();
            }
            this._focusWithCaret(nextEl, "start");
        }

        if (e.key === "Backspace" && this.target.innerHTML === "" && !this.isDeleteDisabled) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.restore();
            const previous = this.target.previousElementSibling as HTMLElement | null;
            const next = this.target.nextElementSibling as HTMLElement | null;
            if ( previous ) previous.focus();
            if ( !previous && next ) next.focus();
            this.target.remove();
        }

        if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const isUp = e.key === "ArrowUp";
            const onEdge = isUp ? this._isCaretOnFirstLine() : this._isCaretOnLastLine();
            if (!onEdge) return;
            const adjacent = this._findAdjacentTextEditor(isUp ? "prev" : "next");
            if (!adjacent) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            this._focusWithCaret(adjacent, isUp ? "end" : "start");
        }
    }

    private _isCaretOnFirstLine(): boolean {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return false;
        if (this.target.innerHTML === "") return true;
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        const targetTop = this.target.getBoundingClientRect().top;
        const first = rects[0];
        if (!first) {
            // Collapsed caret at a boundary may yield no rect — fall back to
            // the element rect so the first keystroke still navigates.
            return true;
        }
        return Math.abs(first.top - targetTop) < 5;
    }

    private _isCaretOnLastLine(): boolean {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return false;
        if (this.target.innerHTML === "") return true;
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        const targetBottom = this.target.getBoundingClientRect().bottom;
        const last = rects[rects.length - 1];
        if (!last) return true;
        return Math.abs(last.bottom - targetBottom) < 5;
    }

    private _findAdjacentTextEditor(direction: "prev" | "next"): HTMLElement | null {
        const selector = Array.from(textTags).map(t => `${t}[contenteditable="true"]`).join(",");
        const all = Array.from(document.querySelectorAll<HTMLElement>(selector));
        const idx = all.indexOf(this.target);
        if (idx === -1) return null;
        return direction === "prev" ? (all[idx - 1] ?? null) : (all[idx + 1] ?? null);
    }

    private _focusWithCaret(el: HTMLElement, position: "start" | "end") {
        el.focus();
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        if (el.innerHTML === "") {
            range.setStart(el, 0);
            range.collapse(true);
        } else if (position === "start") {
            range.selectNodeContents(el);
            range.collapse(true);
        } else {
            range.selectNodeContents(el);
            range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
    }

    private handleInput(e: Event) {
        const editorRoot = getClosestEditorSystem(this.target);
        if (this.target.innerHTML === "<br>") {
            this.target.innerHTML = "";
        }
        if (this.target.innerText === "/" && this.isBlocManagementEnabled && !this.isChangeComponentDisabled) {
            e.stopPropagation();
            e.stopImmediatePropagation()
            const blocLibrary = editorRoot.blocLibrary;
            const actionbar = blocLibrary.open();
            blocLibrary.addEventListener("insert", (e: any) => {
                if (e.detail.type === 'template') {
                    const fragment = document.createRange().createContextualFragment(e.detail.html);
                    this.target.replaceWith(fragment);
                } else if (e.detail.type === 'snippet') {
                    const new_node = document.createElement('w13c-snippet');
                    new_node.setAttribute('identifier', e.detail.identifier);
                    this.target.replaceWith(new_node);
                } else {
                    const new_node = this.createElement(e.detail.id);
                    this.target.replaceWith(new_node);
                }
            }, { once: true });
        }
    }

    init() {
        this.target.removeEventListener("keydown", this.onKeyDown);
        this.target.removeEventListener("input", this.onInput);
        this.target.removeEventListener("paste", this.onPaste);

        this.target.addEventListener("keydown", this.onKeyDown);
        this.target.addEventListener("input", this.onInput);
        this.target.addEventListener("paste", this.onPaste);
        
        if ( this.isTextEditable ){
            this.target.tabIndex = 0;
            this.target.contentEditable = "true";
            if (this.isBlocManagementEnabled && !this.isChangeComponentDisabled){
                this.target.setAttribute(p9r.attr.TEXT.PLACEHOLDER, "Type / or write text");
            } else {
                this.target.setAttribute(p9r.attr.TEXT.PLACEHOLDER, "Type text");
            }
            requestAnimationFrame(() => {
                if (this.target.isConnected) {
                    this.target.focus();
                }
            });
        }
    }

    private get isDeleteDisabled(){
        const deleteAttr = this.target.getAttribute(p9r.attr.ACTION.DISABLE_DELETE);
        return deleteAttr ? deleteAttr === "true" : false;
    }

    override refreshActionBarFeatures() {
        super.refreshActionBarFeatures();
        this._actionBarFeatures.set("addBefore", false);
        this._actionBarFeatures.set("addAfter", false);
        this._actionBarFeatures.set("changeComponent", false);
        this._actionBarFeatures.set("delete", false);
        this._actionBarFeatures.set("duplicate", false);
    }

    private get isAddAfterDisabled(){
        return this.target.getAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER) === "true";
    }

    private get isChangeComponentDisabled(){
        return this.target.getAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT) === "true";
    }

    private get isBlocManagementEnabled(){
        const blocManagementAttr = this.target.getAttribute(p9r.attr.TEXT.BLOC_MANAGEMENT);
        return blocManagementAttr ? blocManagementAttr === "true" : true;
    }

    private get isTextEditable(){
        const textEditableAttr = this.target.getAttribute(p9r.attr.TEXT.EDITABLE);
        return textEditableAttr ? textEditableAttr === "true" : true;
    }

    restore() {
        this.target.removeAttribute('tabIndex');
        this.target.removeAttribute('contentEditable');
        this.target.removeAttribute(p9r.attr.TEXT.PLACEHOLDER);

        this.target.removeAttribute(p9r.attr.TEXT.BLOC_MANAGEMENT);
        this.target.removeAttribute(p9r.attr.TEXT.EDITABLE);

        this.target.removeEventListener("keydown", this.onKeyDown);
        this.target.removeEventListener("input", this.onInput);
        this.target.removeEventListener("paste", this.onPaste);
    }

    public override dispose() {
        this.attrObserver?.disconnect();
        this.attrObserver = undefined;
        this.target.removeEventListener("keydown", this.onKeyDown);
        this.target.removeEventListener("input", this.onInput);
        this.target.removeEventListener("paste", this.onPaste);
        super.dispose();
    }
}