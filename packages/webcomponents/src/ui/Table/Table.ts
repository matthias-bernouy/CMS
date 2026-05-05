import { Component } from "../../base/Component";
import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import "./Row/Row";
import "./Cell/Cell";
import "./HeaderCell/HeaderCell";

export class Table extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }
}

if (!customElements.get("p9r-table")) {
    customElements.define("p9r-table", Table);
}