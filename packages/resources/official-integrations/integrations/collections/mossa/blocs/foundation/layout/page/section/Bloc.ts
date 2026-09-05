import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class MossaSection extends Component {
    constructor() {
        super({ css, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaSection);
