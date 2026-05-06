import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    private _btn: HTMLElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._btn = this.shadowRoot?.querySelector('.trigger') ?? null;
        this._btn?.addEventListener('click', this._onToggle);
        document.addEventListener('click', this._onOutside);
    }

    disconnectedCallback(): void {
        this._btn?.removeEventListener('click', this._onToggle);
        document.removeEventListener('click', this._onOutside);
    }

    private _onToggle = () => this.toggleAttribute('open');
    private _onOutside = (e: MouseEvent) => {
        if (!this.contains(e.target as Node)) this.removeAttribute('open');
    };
}
