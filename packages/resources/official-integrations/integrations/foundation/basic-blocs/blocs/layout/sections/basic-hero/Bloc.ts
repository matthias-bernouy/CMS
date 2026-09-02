import { Component } from "@bernouy/components/base";

import { basicColorSchemeCss } from "./colorSchemes";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class BasicHero extends Component {
    constructor() {
        super({ css: `${basicColorSchemeCss("primary")}\n${css}`, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicHero);
