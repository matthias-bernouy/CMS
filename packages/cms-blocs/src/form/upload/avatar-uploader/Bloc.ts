import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const button = this.shadowRoot!.querySelector('.camera') as HTMLButtonElement;
        const input  = this.shadowRoot!.querySelector('input[type="file"]') as HTMLInputElement;
        button.addEventListener('click', () => input.click());
        input.addEventListener('change', this._onFile);
    }

    disconnectedCallback(): void {
        const input = this.shadowRoot!.querySelector('input[type="file"]') as HTMLInputElement;
        input?.removeEventListener('change', this._onFile);
    }

    private _onFile = (e: Event) => {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        this.dispatchEvent(new CustomEvent('avatar-change', {
            bubbles: true,
            detail: { file },
        }));
    };
}
