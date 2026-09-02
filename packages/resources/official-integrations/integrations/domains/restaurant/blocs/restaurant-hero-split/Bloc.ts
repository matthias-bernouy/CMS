import { Component } from "@bernouy/components/base";

import { RestaurantCarouselController } from "./carousel";
import baseCss from "./styles/base.css" with { type: "text" };
import responsiveCss from "./styles/responsive.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class RestaurantHeroSplit extends Component {
    static observedAttributes = ["autoplay", "rotation-interval"];

    carousel = new RestaurantCarouselController(this);

    constructor() {
        super({ css: `${baseCss}\n${responsiveCss}`, template });
    }

    connectedCallback() {
        this.carousel.connect();
    }

    disconnectedCallback() {
        this.carousel.disconnect();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.carousel.restart();
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", RestaurantHeroSplit);
