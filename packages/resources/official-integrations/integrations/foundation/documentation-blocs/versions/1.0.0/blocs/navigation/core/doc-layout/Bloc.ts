import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["sidebar-open"];
    _toggle = null;
    _backdrop = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._toggle = this.shadowRoot?.querySelector(".toggle") ?? null;
        this._backdrop = this.shadowRoot?.querySelector(".backdrop") ?? null;
        this._toggle?.addEventListener("click", this._onToggle);
        this._backdrop?.addEventListener("click", this._onClose);
    }
    disconnectedCallback() {
        this._toggle?.removeEventListener("click", this._onToggle);
        this._backdrop?.removeEventListener("click", this._onClose);
    }
    _onToggle = () => {
        if (this.hasAttribute("sidebar-open")) {
            this.removeAttribute("sidebar-open");
        } else {
            this.setAttribute("sidebar-open", "");
        }
    };
    _onClose = () => this.removeAttribute("sidebar-open");
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
