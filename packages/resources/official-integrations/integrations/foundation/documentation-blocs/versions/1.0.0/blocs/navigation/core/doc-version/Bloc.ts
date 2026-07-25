import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _btn = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._btn = this.shadowRoot?.querySelector(".trigger") ?? null;
        this._btn?.addEventListener("click", this._onToggle);
        document.addEventListener("click", this._onOutside);
    }
    disconnectedCallback() {
        this._btn?.removeEventListener("click", this._onToggle);
        document.removeEventListener("click", this._onOutside);
    }
    _onToggle = () => this.toggleAttribute("open");
    _onOutside = (e) => {
        if (!this.contains(e.target)) {
            this.removeAttribute("open");
        }
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
