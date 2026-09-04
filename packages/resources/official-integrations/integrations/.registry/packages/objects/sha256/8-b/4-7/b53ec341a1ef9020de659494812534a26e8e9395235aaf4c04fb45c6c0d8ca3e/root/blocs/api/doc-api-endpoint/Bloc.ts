import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["method"];

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this._syncMethod();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this._syncMethod();
        }
    }

    _syncMethod() {
        const method = this.shadowRoot?.querySelector(".method");
        if (method) {
            method.textContent = (this.getAttribute("method") || "GET").toUpperCase();
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
