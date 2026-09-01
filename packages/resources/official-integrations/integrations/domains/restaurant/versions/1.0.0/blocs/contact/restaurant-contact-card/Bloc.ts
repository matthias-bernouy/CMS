import { Component } from "@bernouy/components/base";

import baseCss from "./styles/base.css" with { type: "text" };
import responsiveCss from "./styles/responsive.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class RestaurantContactCard extends Component {
    constructor() {
        super({ css: `${baseCss}\n${responsiveCss}`, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", RestaurantContactCard);
