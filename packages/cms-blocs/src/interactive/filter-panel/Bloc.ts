import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const reset = this.shadowRoot?.querySelector('.reset');
        reset?.addEventListener('click', this._onReset);
    }

    disconnectedCallback(): void {
        const reset = this.shadowRoot?.querySelector('.reset');
        reset?.removeEventListener('click', this._onReset);
    }

    private _onReset = () => {
        this.dispatchEvent(new CustomEvent('filters-reset', { bubbles: true }));
    };
}
