import { Component } from "../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import "./BreadcrumbItem/BreadcrumbItem";

export class Breadcrumb extends Component {

    static get observedAttributes() {
        return ['separator'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        this._syncSeparator();
        this._markCurrent();
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === 'separator') this._syncSeparator();
    }

    private _syncSeparator() {
        const sep = this.getAttribute('separator') ?? '/';
        this.style.setProperty('--_separator', `"${sep.replace(/"/g, '\\"')}"`);
    }

    private _markCurrent() {
        const items = Array.from(this.querySelectorAll('p9r-breadcrumb-item'));
        const last = items[items.length - 1];
        if (last && !last.hasAttribute('current')) last.setAttribute('current', '');
    }
}

if (!customElements.get("p9r-breadcrumb")) {
    customElements.define("p9r-breadcrumb", Breadcrumb);
}
