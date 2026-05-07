import { Editor } from "../Editor/Editor";
import getClosestEditorSystem from "../../dom/editor/getClosestEditorSystem";

const cssStyle = `
    li:empty::before{
        content: attr(p9r-text-placeholder);
        color: #aaa;
        pointer-events: none;
        display: block;
        font-style: italic;
        font-weight: 300;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`

export class ListEditor extends Editor {

    private onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    private onInput   = (e: Event)         => this.handleInput(e);

    constructor(target: HTMLElement) {
        super(target, cssStyle);

        let li = this.target.querySelector("li");
        if (!li) {
            li = document.createElement("li");
            this.target.append(li);
        }
        if (this.target.hasAttribute(p9r.attr.EDITOR.IS_CREATING)) {
            const firstLi = li;
            requestAnimationFrame(() => {
                if (firstLi.isConnected) firstLi.focus();
            });
        }
    }

    handleKeyDown(e: KeyboardEvent) {
        const item = e.target as HTMLElement;

        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (item.innerHTML === "") this.exitListWithParagraph(item);
            else                       this.splitItem(item);
            return;
        }

        if (e.key === "Backspace" && item.innerHTML === "") {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.removeEmptyItem(item);
        }
    }

    /**
     * Enter on an empty `<li>` exits the list: drop the empty item, append
     * a fresh `<p>` after the list, hand it to the editor system so it
     * gets the standard text-editor treatment, and place the caret in it.
     * If the empty item was the only one, the list itself is removed.
     */
    private exitListWithParagraph(emptyItem: HTMLElement): void {
        const p = document.createElement("p");
        const parentId = this.target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (parentId) p.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
        p.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");

        this.target.after(p);
        emptyItem.remove();
        if (!this.target.querySelector("li")) this.target.remove();

        const observer = getClosestEditorSystem(p).observer;
        if (observer) observer.make_it_editor(p);

        this.focusAtStart(p);
    }

    /**
     * Enter mid-text splits the current `<li>`: the content after the caret
     * is moved into a fresh `<li>` inserted right after, and the caret
     * lands at the start of the new item — same UX as `<p>` splitting in
     * `TextEditor`.
     */
    private splitItem(item: HTMLElement): void {
        const newItem = document.createElement("li");

        const sel = window.getSelection();
        if (sel && sel.rangeCount && sel.anchorNode && item.contains(sel.anchorNode) && item.lastChild) {
            const range = sel.getRangeAt(0);
            if (!range.collapsed) range.deleteContents();
            const tail = range.cloneRange();
            tail.setEndAfter(item.lastChild);
            const fragment = tail.extractContents();
            newItem.appendChild(fragment);
        }

        item.after(newItem);
        this.editorifyItem(newItem);
        this.focusAtStart(newItem);
    }

    /**
     * Backspace on an empty `<li>` removes it and restores the caret on the
     * neighbouring item. When that empties the list entirely, the list
     * element is removed and focus moves to the surrounding block.
     */
    private removeEmptyItem(item: HTMLElement): void {
        const previousItem = item.previousElementSibling as HTMLElement | null;
        const nextItem     = item.nextElementSibling     as HTMLElement | null;
        const listPrev     = this.target.previousElementSibling as HTMLElement | null;
        const listNext     = this.target.nextElementSibling     as HTMLElement | null;

        item.removeEventListener("keydown", this.onKeyDown);
        item.removeEventListener("input",   this.onInput);
        item.remove();

        if (!this.target.querySelector("li")) {
            this.target.remove();
            (listPrev ?? listNext)?.focus();
            return;
        }

        (previousItem ?? nextItem)?.focus();
    }

    private editorifyItem(item: HTMLElement): void {
        item.removeEventListener("keydown", this.onKeyDown);
        item.removeEventListener("input",   this.onInput);
        item.contentEditable = "true";
        item.setAttribute(p9r.attr.TEXT.PLACEHOLDER, "Type text");
        item.addEventListener("keydown", this.onKeyDown);
        item.addEventListener("input",   this.onInput);
    }

    private focusAtStart(el: HTMLElement): void {
        requestAnimationFrame(() => {
            if (!el.isConnected) return;
            el.focus();
            const sel = window.getSelection();
            if (!sel) return;
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        });
    }

    handleInput(e: Event) {
        const item = e.target as HTMLElement;
        if (item.innerHTML === "<br>") item.innerHTML = "";
    }

    init() {
        const items = this.target.querySelectorAll("li");
        items.forEach((item) => this.editorifyItem(item as HTMLElement));
    }

    restore() {
        const items = this.target.querySelectorAll("li");
        items.forEach((item) => {
            (item as HTMLElement).contentEditable = "false";
            item.removeEventListener("keydown", this.onKeyDown);
            item.removeEventListener("input",   this.onInput);
        });
    }
}
