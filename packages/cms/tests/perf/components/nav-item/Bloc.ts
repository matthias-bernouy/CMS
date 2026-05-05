import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {
    static observedAttributes = ["href"];
    constructor() { super({ css, template: template as unknown as string }); }
    override connectedCallback() { this._sync(); }
    attributeChangedCallback() { this._sync(); }
    private _sync() {
        const a = this.shadowRoot!.querySelector("a");
        a?.setAttribute("href", this.getAttribute("href") || "#");
    }
}
