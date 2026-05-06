import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._header = this.shadowRoot?.querySelector('.header') as HTMLButtonElement | null;
        this._header?.removeEventListener('click', this._onHeaderClick);
        this._header?.addEventListener('click', this._onHeaderClick);
        this._syncAria();
    }

    disconnectedCallback(): void {
        this._header?.removeEventListener('click', this._onHeaderClick);
        this._header = null;
    }

    static observedAttributes = ['open', 'collapsible'];

    attributeChangedCallback(): void {
        this._syncAria();
    }

    private _header: HTMLButtonElement | null = null;

    private _onHeaderClick = () => {
        if (!this.hasAttribute('collapsible')) return;
        this.toggleAttribute('open');
    }

    private _syncAria(): void {
        if (!this._header) return;
        const collapsible = this.hasAttribute('collapsible');
        const open = !collapsible || this.hasAttribute('open');
        this._header.setAttribute('aria-expanded', String(open));
    }

}
