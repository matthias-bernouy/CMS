import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    static observedAttributes = ['disabled', 'name'];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._sync();
    }

    attributeChangedCallback() {
        this._sync();
    }

    private _sync() {
        const fs = this.shadowRoot?.querySelector('fieldset') as HTMLFieldSetElement | null;
        if (!fs) return;
        if (this.hasAttribute('disabled')) fs.setAttribute('disabled', '');
        else fs.removeAttribute('disabled');
        const name = this.getAttribute('name');
        if (name) fs.setAttribute('name', name);
        else fs.removeAttribute('name');
    }
}
