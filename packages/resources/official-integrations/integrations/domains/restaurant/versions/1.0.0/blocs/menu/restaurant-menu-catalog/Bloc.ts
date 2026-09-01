import { Component } from "@bernouy/components/base";

import { RestaurantMenuCatalogController } from "./internals/controller";
import baseCss from "./styles/base.css" with { type: "text" };
import presentationCss from "./styles/presentation.css" with { type: "text" };
import responsiveCss from "./styles/responsive.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class RestaurantMenuCatalog extends Component {
    static observedAttributes = ["navigation-label", "presentation"];

    controller = new RestaurantMenuCatalogController(this);

    constructor() {
        super({ css: `${baseCss}\n${presentationCss}\n${responsiveCss}`, template });
    }

    connectedCallback() {
        this.controller.connect();
    }

    disconnectedCallback() {
        this.controller.disconnect();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.controller.refresh();
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", RestaurantMenuCatalog);
