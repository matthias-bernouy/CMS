import { Component } from "../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Card extends Component {

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }
}

if (!customElements.get("p9r-card")) {
    customElements.define("p9r-card", Card);
}
