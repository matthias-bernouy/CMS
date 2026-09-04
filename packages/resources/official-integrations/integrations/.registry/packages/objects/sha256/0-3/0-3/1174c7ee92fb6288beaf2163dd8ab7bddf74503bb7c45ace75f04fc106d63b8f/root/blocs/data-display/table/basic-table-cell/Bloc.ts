import { Component } from "@bernouy/components/base";

import { basicColorSchemeCss } from "./colorSchemes";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class BasicTableCell extends Component {
    constructor() {
        super({ css: `${basicColorSchemeCss("neutral")}\n${css}`, template });
    }

    connectedCallback() {
        if (!this.hasAttribute("role")) {
            this.setAttribute("role", "cell");
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicTableCell);
