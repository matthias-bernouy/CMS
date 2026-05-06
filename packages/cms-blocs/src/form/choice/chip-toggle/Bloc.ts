import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
        this.setAttribute('role', 'button');
        this.setAttribute('tabindex', '0');
    }

    override connectedCallback(): void {
        this.addEventListener('click', this._onActivate);
        this.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onActivate);
        this.removeEventListener('keydown', this._onKey);
    }

    private _onActivate = () => {
        if (this.hasAttribute('disabled')) return;
        const event = new CustomEvent('chip-toggle', {
            bubbles: true,
            composed: true,
            detail: { value: this.getAttribute('value') ?? '' },
            cancelable: true,
        });
        const proceed = this.dispatchEvent(event);
        if (!proceed) return;
        if (!event.defaultPrevented) {
            this.toggleAttribute('selected');
        }
    };

    private _onKey = (e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this._onActivate();
        }
    };
}
