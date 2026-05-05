import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {
    static observedAttributes = ["value"];
    constructor() { super({ css, template: template as unknown as string }); }
    override connectedCallback() { this._sync(); }
    attributeChangedCallback() { this._sync(); }
    private _sync() {
        const el = this.shadowRoot!.querySelector(".value");
        if (el) el.textContent = this.getAttribute("value") || "0";
    }
}
