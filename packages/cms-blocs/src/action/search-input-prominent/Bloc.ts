import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const input = this.shadowRoot?.querySelector('input');
        const clear = this.shadowRoot?.querySelector('.clear');
        input?.addEventListener('input', this._onInput);
        clear?.addEventListener('click', this._onClear);
        this._syncEmpty();
    }

    disconnectedCallback(): void {
        const input = this.shadowRoot?.querySelector('input');
        const clear = this.shadowRoot?.querySelector('.clear');
        input?.removeEventListener('input', this._onInput);
        clear?.removeEventListener('click', this._onClear);
    }

    private _onInput = () => this._syncEmpty();

    private _onClear = () => {
        const input = this.shadowRoot?.querySelector('input') as HTMLInputElement | null;
        if (!input) return;
        input.value = '';
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        this._syncEmpty();
    };

    private _syncEmpty() {
        const input = this.shadowRoot?.querySelector('input') as HTMLInputElement | null;
        this.toggleAttribute('empty', !input?.value);
    }
}
