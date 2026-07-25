import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["href"];
    _link = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._link = this.shadowRoot?.querySelector(".edit") ?? null;
        this._sync();
    }
    disconnectedCallback() {}
    attributeChangedCallback() {
        this._sync();
    }
    _sync() {
        if (this._link) {
            this._link.href = this.getAttribute("href") ?? "#";
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
