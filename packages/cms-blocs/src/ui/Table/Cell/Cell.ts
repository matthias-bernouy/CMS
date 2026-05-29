import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class TableCell extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback() {
        if (!this.hasAttribute('role')) this.setAttribute('role', 'cell');
    }
}

if (!customElements.get("p9r-cell")) {
    customElements.define("p9r-cell", TableCell);
}
