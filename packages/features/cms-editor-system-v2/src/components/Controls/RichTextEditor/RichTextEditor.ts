import {
    asInterpolation,
    type TextCapability,
} from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

type RichTextAction = "bold" | "italic" | "underline" | "code" | "link" | "dynamic" | "color";

export class RichTextEditor extends HTMLElement {
    private _savedRange: Range | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.label.textContent = this.getAttribute("label") ?? "";
        this.hint.textContent = this.getAttribute("hint") ?? "";
        this.editor.innerHTML = this.getAttribute("value") ?? "";
        this.renderToolbar();
        this.editor.addEventListener("input", this.emitInput);
        this.editor.addEventListener("keyup", this.saveSelection);
        this.editor.addEventListener("mouseup", this.saveSelection);
        this.editor.addEventListener("pointerup", this.saveSelection);
        this.editor.addEventListener("blur", this.saveSelection);
    }

    disconnectedCallback(): void {
        this.editor.removeEventListener("input", this.emitInput);
        this.editor.removeEventListener("keyup", this.saveSelection);
        this.editor.removeEventListener("mouseup", this.saveSelection);
        this.editor.removeEventListener("pointerup", this.saveSelection);
        this.editor.removeEventListener("blur", this.saveSelection);
    }

    private renderToolbar(): void {
        this.toolbar.replaceChildren();
        const capability = this.capability;
        const actions: RichTextAction[] = [];
        if (capability.bold) actions.push("bold");
        if (capability.italic) actions.push("italic");
        if (capability.underline) actions.push("underline");
        if (capability.code) actions.push("code");
        if (capability.link) actions.push("link");
        if (capability.color) actions.push("color");
        if (capability.dynamic) actions.push("dynamic");

        for (const action of actions) {
            const button = document.createElement("button");
            button.className = "tool";
            button.type = "button";
            button.innerHTML = this.actionIcon(action);
            button.title = this.actionTitle(action);
            button.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.runAction(action);
            });
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
            this.toolbar.append(button);
        }
    }

    private runAction(action: RichTextAction): void {
        if (action !== "dynamic" && (!this._savedRange || this._savedRange.collapsed)) return;

        if (action === "bold") {
            this.toggleRange("strong");
        } else if (action === "italic") {
            this.toggleRange("em");
        } else if (action === "underline") {
            this.toggleRange("u");
        } else if (action === "code") {
            this.toggleRange("code");
        } else if (action === "link") {
            if (this.unwrapMatchingRange("a")) {
                this.finishAction();
                return;
            }
            const href = window.prompt("Link URL");
            if (href) this.wrapRange("a", { href });
        } else if (action === "color") {
            if (this.unwrapMatchingRange("span", (element) => element.style.color !== "")) {
                this.finishAction();
                return;
            }
            const color = window.prompt("Text color");
            if (color) this.wrapRange("span", { style: `color: ${color}` });
        } else {
            const expression = window.prompt("Data expression");
            if (expression) this.insertText(asInterpolation(expression));
        }
        this.finishAction();
    }

    private finishAction(): void {
        this.editor.focus();
        this.restoreSelection();
        this.emitInput();
    }

    private toggleRange(tagName: string): void {
        if (this.unwrapMatchingRange(tagName)) return;
        this.wrapRange(tagName);
    }

    private wrapRange(tagName: string, attributes: Record<string, string> = {}): void {
        const range = this.getUsableRange();
        if (!range) return;
        if (range.collapsed) return;

        const wrapper = document.createElement(tagName);
        for (const [name, value] of Object.entries(attributes)) {
            wrapper.setAttribute(name, value);
        }
        wrapper.append(range.extractContents());
        range.insertNode(wrapper);

        const nextRange = document.createRange();
        nextRange.selectNodeContents(wrapper);
        this.setSavedRange(nextRange);
    }

    private unwrapMatchingRange(tagName: string, predicate: (element: HTMLElement) => boolean = () => true): boolean {
        const range = this.getUsableRange();
        if (!range) return false;

        const wrapper = this.findRangeWrapper(range, tagName, predicate);
        if (!wrapper) return false;

        this.unwrapElement(wrapper);
        return true;
    }

    private findRangeWrapper(
        range: Range,
        tagName: string,
        predicate: (element: HTMLElement) => boolean,
    ): HTMLElement | null {
        const start = this.closestWrapper(range.startContainer, tagName, predicate);
        if (!start) return null;

        const end = this.closestWrapper(range.endContainer, tagName, predicate);
        if (start === end) return start;

        return null;
    }

    private closestWrapper(
        node: Node,
        tagName: string,
        predicate: (element: HTMLElement) => boolean,
    ): HTMLElement | null {
        const normalizedTag = tagName.toUpperCase();
        let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;

        while (current && current !== this.editor) {
            if (current instanceof HTMLElement && current.tagName === normalizedTag && predicate(current)) {
                return current;
            }
            current = current.parentNode;
        }

        return null;
    }

    private unwrapElement(element: HTMLElement): void {
        const fragment = document.createDocumentFragment();
        const firstChild = element.firstChild;
        const lastChild = element.lastChild;

        while (element.firstChild) {
            fragment.append(element.firstChild);
        }

        element.replaceWith(fragment);

        const nextRange = document.createRange();
        if (firstChild && lastChild) {
            nextRange.setStartBefore(firstChild);
            nextRange.setEndAfter(lastChild);
        } else {
            nextRange.selectNodeContents(this.editor);
            nextRange.collapse(false);
        }
        this.setSavedRange(nextRange);
    }

    private insertText(text: string): void {
        const range = this.getUsableRange();
        if (!range) {
            this.editor.append(text);
            const nextRange = document.createRange();
            nextRange.selectNodeContents(this.editor);
            nextRange.collapse(false);
            this.setSavedRange(nextRange);
            return;
        }

        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);

        const nextRange = document.createRange();
        nextRange.setStartAfter(node);
        nextRange.collapse(true);
        this.setSavedRange(nextRange);
    }

    private getSelection(): Selection | null {
        const shadowSelection = (this.shadowRoot as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.();
        return shadowSelection ?? this.ownerDocument.getSelection();
    }

    private readonly saveSelection = (): void => {
        const selection = this.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        if (!this.editor.contains(range.commonAncestorContainer)) return;
        this._savedRange = range.cloneRange();
    };

    private getUsableRange(): Range | null {
        if (this._savedRange && this.editor.contains(this._savedRange.commonAncestorContainer)) {
            return this._savedRange.cloneRange();
        }

        const selection = this.getSelection();
        if (!selection || selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);
        if (!this.editor.contains(range.commonAncestorContainer)) return null;

        return range.cloneRange();
    }

    private setSavedRange(range: Range): void {
        this._savedRange = range.cloneRange();
    }

    private restoreSelection(): void {
        if (!this._savedRange) return;
        const selection = this.getSelection();
        if (!selection) return;
        selection.removeAllRanges();
        selection.addRange(this._savedRange);
    }

    private actionIcon(action: RichTextAction): string {
        const icons: Record<RichTextAction, string> = {
            bold: "<strong>B</strong>",
            italic: "<em>I</em>",
            underline: "<span class=\"underline-icon\">U</span>",
            code: "<span>{}</span>",
            link: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></svg>`,
            dynamic: `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>`,
            color: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.8-2.9 1.8 1.8 0 0 1 1.6-2.6H18a6 6 0 0 0 0-12h-6Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14" cy="7.5" r="1"/><circle cx="16.5" cy="11" r="1"/></svg>`,
        };
        return icons[action];
    }

    private actionTitle(action: RichTextAction): string {
        if (action === "bold") return "Bold";
        if (action === "italic") return "Italic";
        if (action === "underline") return "Underline";
        if (action === "code") return "Code";
        if (action === "link") return "Link";
        if (action === "color") return "Color";
        return "Dynamic data";
    }

    private readonly emitInput = (): void => {
        this.dispatchEvent(new CustomEvent("input", {
            bubbles: true,
            composed: true,
            detail: { value: this.editor.innerHTML },
        }));
    };

    private get capability(): TextCapability {
        const raw = this.getAttribute("capability") ?? "{}";
        try {
            return JSON.parse(raw) as TextCapability;
        } catch {
            return { format: "richtext" };
        }
    }

    private get label(): HTMLElement {
        return this.shadowRoot!.querySelector(".label")!;
    }

    private get hint(): HTMLElement {
        return this.shadowRoot!.querySelector(".hint")!;
    }

    private get toolbar(): HTMLElement {
        return this.shadowRoot!.querySelector(".toolbar")!;
    }

    private get editor(): HTMLElement {
        return this.shadowRoot!.querySelector(".editor")!;
    }
}

if (!customElements.get("cms-editor-v2-rich-text-editor")) {
    customElements.define("cms-editor-v2-rich-text-editor", RichTextEditor);
}
