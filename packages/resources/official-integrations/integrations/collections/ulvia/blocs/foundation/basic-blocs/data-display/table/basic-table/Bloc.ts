import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class BasicTable extends Component {
    static observedAttributes = ["accessible-label"];

    constructor() {
        super({ css, template });
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
        if (!this.hasAttribute("role")) {
            this.setAttribute("role", "table");
        }
        const label = this.getAttribute("accessible-label")?.trim();
        if (label) {
            this.setAttribute("aria-label", label);
        } else {
            this.removeAttribute("aria-label");
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicTable);
