import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _slot = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._slot = this.shadowRoot?.querySelector("slot:not([name])") ?? null;
        this._slot?.addEventListener("slotchange", this._syncId);
        this._syncId();
    }
    disconnectedCallback() {
        this._slot?.removeEventListener("slotchange", this._syncId);
    }
    _syncId = () => {
        const text =
            this._slot
                ?.assignedNodes({ flatten: true })
                .map((n) => n.textContent ?? "")
                .join("")
                .trim() ?? "";
        if (!this.id) {
            this.id = text
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
        }
        const anchor = this.querySelector(':scope > a[slot="navigation"]');
        if (anchor && this.id) {
            anchor.setAttribute("href", `#${this.id}`);
            if (!anchor.hasAttribute("aria-label")) {
                anchor.setAttribute("aria-label", `Permalink to ${text || this.id}`);
            }
        }
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
