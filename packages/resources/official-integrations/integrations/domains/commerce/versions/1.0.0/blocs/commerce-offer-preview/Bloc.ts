import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { formatMoney, parseBooleanAttribute } from "./money";

export class CommerceOfferPreview extends Component {
    static observedAttributes = [
        "accent-color",
        "amount",
        "background-color",
        "border-color",
        "currency",
        "locale",
        "muted-text-color",
        "price-color",
        "text-color",
        "whole-unit-prices",
    ];

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
            this.getAttribute("locale"),
            parseBooleanAttribute(this.getAttribute("whole-unit-prices")),
        );
        this.price.textContent = price;
        this.toggleAttribute("data-empty-price", !price);

        for (const [attribute, property] of [
            ["accent-color", "--commerce-offer-accent"],
            ["background-color", "--commerce-offer-background"],
            ["border-color", "--commerce-offer-border"],
            ["muted-text-color", "--commerce-offer-muted-color"],
            ["price-color", "--commerce-offer-price-color"],
            ["text-color", "--commerce-offer-color"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.style.setProperty(property, value);
            } else {
                this.style.removeProperty(property);
            }
        }
    }

    get price() {
        return this.shadowRoot.querySelector("[data-price]");
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferPreview);
