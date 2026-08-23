import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class BasicFaqItem extends Component {
    static observedAttributes = ["open"];

    constructor() {
        super({ css, template });
        this.details = this.shadowRoot.querySelector("details");
    }

    connectedCallback() {
        this.details?.addEventListener("toggle", this.onToggle);
        this.sync();
    }

    disconnectedCallback() {
        this.details?.removeEventListener("toggle", this.onToggle);
    }

    attributeChangedCallback() {
        this.sync();
    }

    sync() {
        if (this.details) {
            this.details.open = this.hasAttribute("open");
        }
    }

    onToggle = () => {
        this.toggleAttribute("open", Boolean(this.details?.open));
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicFaqItem);
