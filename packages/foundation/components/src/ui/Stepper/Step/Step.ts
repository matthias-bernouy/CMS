import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import variantCss from "./variant.css" with { type: "text" };
const css = baseCss + variantCss;

export class Step extends Component {
    private _label: HTMLElement | null;
    private _number: HTMLElement | null;
    private _description: HTMLElement | null;
    private _descriptionSlot: HTMLSlotElement | null;

    static get observedAttributes() {
        return ["label", "data-index"];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._label = this.shadowRoot?.querySelector(".label") ?? null;
        this._number = this.shadowRoot?.querySelector(".number") ?? null;
        this._description = this.shadowRoot?.querySelector(".description") ?? null;
        this._descriptionSlot = this.shadowRoot?.querySelector(".description slot") ?? null;
    }

    override connectedCallback() {
        this._sync();
        this._descriptionSlot?.addEventListener("slotchange", this._syncDescription);
        this._syncDescription();
    }

    disconnectedCallback() {
        this._descriptionSlot?.removeEventListener("slotchange", this._syncDescription);
    }

    attributeChangedCallback(_name: string, _oldVal: string | null, _newVal: string | null) {
        this._sync();
    }

    /** Hide the description only when nothing is slotted — CSS `:empty`/`:has`
     *  on a `<slot>` ignores assigned content (see Checkbox). */
    private _syncDescription = () => {
        if (!this._description || !this._descriptionSlot) {
            return;
        }
        const hasContent = this._descriptionSlot
            .assignedNodes({ flatten: true })
            .some((n) => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? "").trim() !== "");
        this._description.classList.toggle("is-empty", !hasContent);
    };

    private _sync() {
        if (this._label) {
            this._label.textContent = this.getAttribute("label") ?? "";
        }
        if (this._number) {
            this._number.textContent = this.getAttribute("data-index") ?? "";
        }
    }
}
