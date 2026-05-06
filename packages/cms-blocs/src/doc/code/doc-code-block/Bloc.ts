import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    private _copyBtn: HTMLButtonElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._copyBtn = this.shadowRoot?.querySelector('.copy') ?? null;
        this._copyBtn?.addEventListener('click', this._onCopy);
    }

    disconnectedCallback(): void {
        this._copyBtn?.removeEventListener('click', this._onCopy);
    }

    private _onCopy = async () => {
        const slot = this.shadowRoot?.querySelector('slot:not([name])') as HTMLSlotElement | null;
        const text = slot?.assignedNodes({ flatten: true }).map(n => n.textContent ?? '').join('') ?? '';
        try {
            await navigator.clipboard.writeText(text.trim());
            this.setAttribute('copied', '');
            setTimeout(() => this.removeAttribute('copied'), 1500);
        } catch {}
    };
}
