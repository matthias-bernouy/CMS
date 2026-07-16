import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class CommerceOfferPreview extends Component {
    static observedAttributes = [
        "accessible-label",
        "accent-color",
        "amount",
        "background-color",
        "border-color",
        "currency",
        "href",
        "locale",
        "muted-text-color",
        "price-color",
        "target",
        "text-color",
    ];

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this.sync();
    }

    attributeChangedCallback() {
        if (this.isConnected) this.sync();
    }

    sync() {
        const href = this.getAttribute("href")?.trim() || "";
        if (href) {
            this.navigation.setAttribute("href", href);
            this.navigation.setAttribute("aria-label", this.getAttribute("accessible-label") || "Voir l’annonce");
        } else {
            this.navigation.removeAttribute("href");
            this.navigation.removeAttribute("aria-label");
        }
        const target = this.getAttribute("target")?.trim();
        if (target) this.navigation.setAttribute("target", target);
        else this.navigation.removeAttribute("target");
        if (target === "_blank") this.navigation.setAttribute("rel", "noopener noreferrer");
        else this.navigation.removeAttribute("rel");

        const price = formatMoney(
            this.getAttribute("amount"),
            this.getAttribute("currency"),
            this.getAttribute("locale"),
        );
        this.price.textContent = price;
        this.toggleAttribute("data-empty-price", !price);
        this.syncMedia();

        for (const [attribute, property] of [
            ["accent-color", "--commerce-offer-accent"],
            ["background-color", "--commerce-offer-background"],
            ["border-color", "--commerce-offer-border"],
            ["muted-text-color", "--commerce-offer-muted-color"],
            ["price-color", "--commerce-offer-price-color"],
            ["text-color", "--commerce-offer-color"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) this.style.setProperty(property, value);
            else this.style.removeProperty(property);
        }
    }

    syncMedia() {
        for (const image of this.querySelectorAll('img[slot="media"][data-src]')) {
            const source = image.getAttribute("data-src")?.trim() || "";
            if (source && !source.includes("{{") && image.getAttribute("src") !== source) {
                image.setAttribute("src", source);
            }
        }
    }

    get navigation() {
        return this.shadowRoot.querySelector("[data-navigation]");
    }

    get price() {
        return this.shadowRoot.querySelector("[data-price]");
    }
}

function formatMoney(rawAmount, rawCurrency, rawLocale) {
    const amount = Number(rawAmount);
    const currency = rawCurrency?.trim().toUpperCase();
    if (!Number.isFinite(amount) || !currency) return "";
    try {
        return new Intl.NumberFormat(rawLocale?.trim() || undefined, {
            style: "currency",
            currency,
        }).format(amount / 100);
    } catch {
        return `${(amount / 100).toFixed(2)} ${currency}`;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferPreview);
