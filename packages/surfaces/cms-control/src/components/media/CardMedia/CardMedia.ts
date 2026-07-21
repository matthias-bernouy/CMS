import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class CardMedia extends Component {
    constructor() {
        super({
            css: css as unknown as string,
            template: template as unknown as string,
        });
    }
}

if (!customElements.get("p9r-card-media")) {
    customElements.define("p9r-card-media", CardMedia);
}
