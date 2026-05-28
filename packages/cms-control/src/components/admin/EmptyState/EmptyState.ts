import { Component } from "@bernouy/cms/component";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class EmptyState extends Component {
    constructor() {
        super({
            css: css as unknown as string,
            template: template as unknown as string,
        });
    }
}

if (!customElements.get("cms-empty-state")) {
    customElements.define("cms-empty-state", EmptyState);
}
