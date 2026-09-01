import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

let instanceCount = 0;

export class Bloc extends Component {
    _btn = null;
    _slot = null;
    constructor() {
        super({ css, template });
        instanceCount += 1;
        const panelId = `version-options-${instanceCount}`;
        this.shadowRoot?.querySelector(".panel")?.setAttribute("id", panelId);
        this.shadowRoot?.querySelector(".trigger")?.setAttribute("aria-controls", panelId);
    }
    connectedCallback() {
        this._btn = this.shadowRoot?.querySelector(".trigger") ?? null;
        this._slot = this.shadowRoot?.querySelector("slot:not([name])") ?? null;
        this._btn?.addEventListener("click", this._onToggle);
        this._slot?.addEventListener("slotchange", this._syncItems);
        document.addEventListener("click", this._onOutside);
        document.addEventListener("keydown", this._onKeydown);
        this._syncItems();
        this._syncExpanded();
    }
    disconnectedCallback() {
        this._btn?.removeEventListener("click", this._onToggle);
        this._slot?.removeEventListener("slotchange", this._syncItems);
        document.removeEventListener("click", this._onOutside);
        document.removeEventListener("keydown", this._onKeydown);
    }
    _onToggle = () => {
        this.toggleAttribute("open");
        this._syncExpanded();
    };
    _onOutside = (e) => {
        if (!this.contains(e.target)) {
            this._close(false);
        }
    };
    _onKeydown = (e) => {
        if (e.key === "Escape" && this.hasAttribute("open")) {
            e.preventDefault();
            this._close(true);
        }
    };
    _syncItems = () => {
        this._slot?.assignedElements().forEach((item) => item.setAttribute("role", "menuitem"));
    };
    _syncExpanded = () => this._btn?.setAttribute("aria-expanded", String(this.hasAttribute("open")));
    _close(restoreFocus) {
        this.removeAttribute("open");
        this._syncExpanded();
        if (restoreFocus) {
            this._btn?.focus();
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
