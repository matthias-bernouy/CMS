import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { formatMoney, parseBooleanAttribute } from "./money";

export class CommerceOfferPreview extends Component {
    static observedAttributes = ["amount", "currency", "locale", "whole-unit-prices"];

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this.sync();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    sync() {
        const price = formatMoney(
            this.getAttribute("amount"),
            this.getAttribute("currency"),
            this.getAttribute("locale") || "en-US",
            parseBooleanAttribute(this.getAttribute("whole-unit-prices")),
        );
        this.price.textContent = price;
        this.toggleAttribute("data-empty-price", !price);
    }

    get price() {
        return this.shadowRoot.querySelector("[data-price]");
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferPreview);
