import { Component } from "@bernouy/components/base";

import { mossaColorSchemeCss } from "./colorSchemes";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class MossaResponsiveGrid extends Component {
    constructor() {
        super({ css: `${mossaColorSchemeCss("neutral")}\n${css}`, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaResponsiveGrid);
