import { Component } from "@bernouy/components/base";

import { RestaurantMenuController } from "./controller";
import baseCss from "./styles/base.css" with { type: "text" };
import presentationCss from "./styles/presentation.css" with { type: "text" };
import responsiveCss from "./styles/responsive.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class RestaurantMenu extends Component {
    static observedAttributes = ["open"];

    controller = new RestaurantMenuController(this);

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
            this.controller.sync();
        }
    }

    openMenu(trigger) {
        this.controller.open(trigger);
    }

    closeMenu() {
        this.controller.close();
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", RestaurantMenu);
