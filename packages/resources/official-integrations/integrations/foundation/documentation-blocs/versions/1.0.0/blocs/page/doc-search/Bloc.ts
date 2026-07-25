import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _input = null;
    _phSlot = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._input = this.shadowRoot?.querySelector(".input") ?? null;
        this._phSlot = this.shadowRoot?.querySelector('slot[name="placeholder"]') ?? null;
        this._phSlot?.addEventListener("slotchange", this._syncPh);
        this._syncPh();
        this._input?.addEventListener("input", this._onInput);
        window.addEventListener("keydown", this._onKey);
    }
    disconnectedCallback() {
        this._phSlot?.removeEventListener("slotchange", this._syncPh);
        this._input?.removeEventListener("input", this._onInput);
        window.removeEventListener("keydown", this._onKey);
    }
    _syncPh = () => {
        if (!this._input) {
            return;
        }
        const text = this._phSlot
            ?.assignedNodes({ flatten: true })
            .map((n) => n.textContent ?? "")
            .join("")
            .trim();
        this._input.placeholder = text || "Search documentation...";
    };
    _onInput = (e) => {
        const value = e.target.value;
        this.dispatchEvent(new CustomEvent("doc-search", { detail: { value }, bubbles: true, composed: true }));
    };
    _onKey = (e) => {
        if (this.getAttribute("shortcut") !== "true") {
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            this._input?.focus();
        }
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
