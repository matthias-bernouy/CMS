import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    static observedAttributes = ['href', 'target'];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.addEventListener('click', this.onClick);
        document.addEventListener('mousedown', this._onDocMouseDown);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this.onClick);
        document.removeEventListener('mousedown', this._onDocMouseDown);
    }

    private _onDocMouseDown = (e: MouseEvent) => {
        if (!this.contains(e.target as Node)) {
            this._close();
        }
    }

    attributeChangedCallback(): void {
        this._syncAnchor();
    }

    private onClick = () => {
        this._toggle();
    }

    private _syncAnchor(): void {
        const a = this.shadowRoot?.querySelector('a.label') as HTMLAnchorElement | null;
        if (!a) return;
        const href = this.getAttribute('href');
        const target = this.getAttribute('target');
        if (href) a.setAttribute('href', href);
        if (target) a.setAttribute('target', target);
    }

    private _toggle(): void {
        const item = this.shadowRoot?.querySelector('.item');
        item?.classList.toggle('is-open');
    }

    private _close(): void {
        const item = this.shadowRoot?.querySelector('.item');
        item?.classList.remove('is-open');
    }

}
