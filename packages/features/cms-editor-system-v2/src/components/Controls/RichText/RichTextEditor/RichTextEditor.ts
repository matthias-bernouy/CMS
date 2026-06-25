import type { TextCapability } from "@bernouy/cms-content/editor";
import { DynamicDataPickerController } from "../../DynamicData/DynamicDataPickerController";
import { parseTextCapability } from "./richTextAttributes";
import type { RichTextAction } from "./richTextActions";
import { RichTextRangeCommands } from "./richTextRangeCommands";
import { renderRichTextToolbar } from "./richTextToolbar";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class RichTextEditor extends HTMLElement {
    private readonly _range = new RichTextRangeCommands(
        () => this.editor,
        () => this.getSelection(),
    );
    private readonly _dataPicker = new DynamicDataPickerController({
        picker:      () => this.dataPicker,
        search:      () => this.dataSearch,
        list:        () => this.dataList,
        closeButton: () => this.closeDataButton,
        rawScopes:   () => this.getAttribute("data-scopes"),
    }, {
        saveSelection:    this._range.saveSelection,
        restoreSelection: () => this._range.restoreSelection(),
        insertText:       (text) => this._range.insertText(text),
        focusControl:     () => this.editor.focus(),
        finish:           () => this.finishAction(),
    });

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
        this.editor.addEventListener("keyup", this._range.saveSelection);
        this.editor.addEventListener("mouseup", this._range.saveSelection);
        this.editor.addEventListener("pointerup", this._range.saveSelection);
        this.editor.addEventListener("blur", this._range.saveSelection);
        this._dataPicker.connect();
    }

    disconnectedCallback(): void {
        this.editor.removeEventListener("input", this.emitInput);
        this.editor.removeEventListener("keyup", this._range.saveSelection);
        this.editor.removeEventListener("mouseup", this._range.saveSelection);
        this.editor.removeEventListener("pointerup", this._range.saveSelection);
        this.editor.removeEventListener("blur", this._range.saveSelection);
        this._dataPicker.disconnect();
    }

    private renderToolbar(): void {
        renderRichTextToolbar(this.toolbar, this.capability, {
            action:   (action) => this.runAction(action),
            textSize: (direction) => {
                if (this._range.stepTextSize(direction)) this.finishAction();
            },
        });
    }

    private runAction(action: RichTextAction): void {
        if (action !== "dynamic" && !this._range.hasSelectedRange()) return;

        if (action === "bold") {
            this._range.toggleRange("strong");
        } else if (action === "italic") {
            this._range.toggleRange("em");
        } else if (action === "underline") {
            this._range.toggleRange("u");
        } else if (action === "code") {
            this._range.toggleRange("code");
        } else if (action === "link") {
            if (this._range.unwrapMatchingRange("a")) {
                this.finishAction();
                return;
            }
            const href = window.prompt("Link URL");
            if (href) this._range.wrapRange("a", { href });
        } else {
            this._dataPicker.open();
            return;
        }
        this.finishAction();
    }

    private finishAction(): void {
        this.editor.focus();
        this._range.restoreSelection();
        this.emitInput();
    }

    private getSelection(): Selection | null {
        const shadowSelection = (this.shadowRoot as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.();
        return shadowSelection ?? this.ownerDocument.getSelection?.() ?? null;
    }

    private readonly emitInput = (): void => {
        this.dispatchEvent(new CustomEvent("input", {
            bubbles: true,
            composed: true,
            detail: { value: this.editor.innerHTML },
        }));
    };

    private get capability(): TextCapability {
        return parseTextCapability(this.getAttribute("capability"));
    }

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector<T>(selector)!;
    }

    private get label(): HTMLElement { return this.query(".label"); }

    private get hint(): HTMLElement { return this.query(".hint"); }

    private get toolbar(): HTMLElement { return this.query(".toolbar"); }

    private get dataPicker(): HTMLElement { return this.query(".data-picker"); }

    private get dataSearch(): HTMLInputElement { return this.query(".data-search"); }

    private get dataList(): HTMLElement { return this.query(".data-list"); }

    private get closeDataButton(): HTMLButtonElement { return this.query(".close-data"); }

    private get editor(): HTMLElement { return this.query(".editor"); }
}

if (!customElements.get("cms-editor-v2-rich-text-editor")) {
    customElements.define("cms-editor-v2-rich-text-editor", RichTextEditor);
}
