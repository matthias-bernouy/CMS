import { Component } from "@bernouy/components/base";

import style from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class RestaurantMenuSection extends Component {
    constructor() {
        super({ css: style, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", RestaurantMenuSection);
