import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    static observedAttributes = ['href'];

    private _link: HTMLAnchorElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._link = this.shadowRoot?.querySelector('.edit') ?? null;
        this._sync();
    }

    disconnectedCallback(): void {}

    attributeChangedCallback() { this._sync(); }

    private _sync() {
        if (this._link) this._link.href = this.getAttribute('href') ?? '#';
    }
}
