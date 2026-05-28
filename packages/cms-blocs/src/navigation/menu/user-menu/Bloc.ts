import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const trigger = this.shadowRoot!.querySelector('.trigger') as HTMLButtonElement;
        trigger.addEventListener('click', this._onToggle);
        document.addEventListener('click', this._onOutsideClick);
        document.addEventListener('keydown', this._onEscape);
    }

    disconnectedCallback(): void {
        const trigger = this.shadowRoot!.querySelector('.trigger') as HTMLButtonElement;
        trigger?.removeEventListener('click', this._onToggle);
        document.removeEventListener('click', this._onOutsideClick);
        document.removeEventListener('keydown', this._onEscape);
    }

    private _onToggle = (e: Event) => {
        e.stopPropagation();
        this.toggleAttribute('open');
    };

    private _onOutsideClick = (e: Event) => {
        if (!this.hasAttribute('open')) return;
        if (this.contains(e.target as Node)) return;
        this.removeAttribute('open');
    };

    private _onEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') this.removeAttribute('open');
    };
}
