import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class BasicTableRow extends Component {
    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        if (!this.hasAttribute("role")) {
            this.setAttribute("role", "row");
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicTableRow);
