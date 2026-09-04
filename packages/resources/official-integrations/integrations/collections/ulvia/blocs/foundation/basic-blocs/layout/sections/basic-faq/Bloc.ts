import { Component } from "@bernouy/components/base";

import { basicColorSchemeCss } from "./colorSchemes";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class BasicFaq extends Component {
    constructor() {
        super({ css: `${basicColorSchemeCss("neutral")}\n${css}`, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicFaq);
