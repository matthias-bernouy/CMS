import { Component } from "@bernouy/components/base";

import { BasicMenuController } from "./internals/controller";
import { basicColorSchemeCss } from "./internals/colorSchemes";
import baseCss from "./styles/base.css" with { type: "text" };
import presentationCss from "./styles/presentation.css" with { type: "text" };
import responsiveCss from "./styles/responsive.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class BasicMenu extends Component {
    static observedAttributes = ["close-label", "id", "navigation-label", "open"];

    controller = new BasicMenuController(this);

    constructor() {
        super({
            css: `${basicColorSchemeCss("neutral")}\n${baseCss}\n${presentationCss}\n${responsiveCss}`,
            template,
        });
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

    get open() {
        return this.hasAttribute("open");
    }

    set open(value) {
        this.toggleAttribute("open", Boolean(value));
    }

    openMenu() {
        this.controller.open();
    }

    closeMenu() {
        this.controller.close();
    }

    toggleMenu() {
        this.controller.toggle();
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicMenu);
