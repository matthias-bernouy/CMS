import { Component } from "@bernouy/components/base";

import { basicColorSchemeCss } from "./colorSchemes";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class BasicSiteFooter extends Component {
    static observedAttributes = ["navigation-label"];

    constructor() {
        super({ css: `${basicColorSchemeCss("neutral")}\n${css}`, template });
        this.navigation = this.shadowRoot.querySelector("nav");
    }

    connectedCallback() {
        this.syncAccessibility();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.syncAccessibility();
        }
    }

    syncAccessibility() {
        this.navigation.setAttribute("aria-label", this.getAttribute("navigation-label") || "Footer navigation");
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicSiteFooter);
