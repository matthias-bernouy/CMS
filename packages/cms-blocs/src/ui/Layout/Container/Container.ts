import { Component } from "@bernouy/cms-blocs/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Container extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }
}

if (!customElements.get("p9r-container")) {
    customElements.define("p9r-container", Container);
}
