import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class BasicBadge extends Component {
    constructor() {
        super({ css, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicBadge);
