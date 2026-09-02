import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _anchor = null;
    _slot = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._anchor = this.shadowRoot?.querySelector(".anchor") ?? null;
        this._slot = this.shadowRoot?.querySelector("slot") ?? null;
        this._slot?.addEventListener("slotchange", this._syncId);
        this._anchor?.addEventListener("click", this._onCopy);
        this._syncId();
    }
    disconnectedCallback() {
        this._slot?.removeEventListener("slotchange", this._syncId);
        this._anchor?.removeEventListener("click", this._onCopy);
    }
    _syncId = () => {
        if (this.id) {
            return;
        }
        const text =
            this._slot
                ?.assignedNodes({ flatten: true })
                .map((n) => n.textContent ?? "")
                .join("")
                .trim() ?? "";
        this.id = text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    };
    _onCopy = async (e) => {
        e.preventDefault();
        const url = `${location.origin}${location.pathname}#${this.id}`;
        try {
            await navigator.clipboard.writeText(url);
        } catch {}
        history.replaceState(null, "", `#${this.id}`);
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
