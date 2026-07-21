import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class BasicGrid extends Component {
    static observedAttributes = ["background-color", "text-color"];

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this.syncColors();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.syncColors();
        }
    }

    syncColors() {
        for (const [attribute, property] of [
            ["background-color", "--basic-grid-background"],
            ["text-color", "--basic-grid-color"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.style.setProperty(property, value);
            } else {
                this.style.removeProperty(property);
            }
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicGrid);
