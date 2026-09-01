import { Component } from "@bernouy/components/base";

import { RestaurantMenuTriggerController } from "./menu-trigger";
import baseCss from "./styles/base.css" with { type: "text" };
import responsiveCss from "./styles/responsive.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class RestaurantHeader extends Component {
    static observedAttributes = ["menu-target", "navigation-label"];

    menuTrigger = new RestaurantMenuTriggerController(this);

    constructor() {
        super({ css: `${baseCss}\n${responsiveCss}`, template });
    }

    connectedCallback() {
        this.sync();
        this.menuTrigger.connect();
    }

    disconnectedCallback() {
        this.menuTrigger.disconnect();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
            this.menuTrigger.refresh();
        }
    }

    sync() {
        const navigation = this.shadowRoot.querySelector("nav");
        navigation?.setAttribute("aria-label", this.getAttribute("navigation-label") || "Primary navigation");
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", RestaurantHeader);
