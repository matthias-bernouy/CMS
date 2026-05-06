import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    private _media: HTMLElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._media = this.shadowRoot?.querySelector('.media') ?? null;
        this._media?.addEventListener('click', this._onClick);
    }

    disconnectedCallback(): void {
        this._media?.removeEventListener('click', this._onClick);
    }

    private _onClick = () => {
        if (this.getAttribute('zoom') !== 'true') return;
        this.toggleAttribute('zoomed');
    };
}
