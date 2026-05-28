import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    private _input: HTMLInputElement | null = null;
    private _phSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._input = this.shadowRoot?.querySelector('.input') ?? null;
        this._phSlot = this.shadowRoot?.querySelector('slot[name="placeholder"]') ?? null;
        this._phSlot?.addEventListener('slotchange', this._syncPh);
        this._syncPh();
        this._input?.addEventListener('input', this._onInput);
        window.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback(): void {
        this._phSlot?.removeEventListener('slotchange', this._syncPh);
        this._input?.removeEventListener('input', this._onInput);
        window.removeEventListener('keydown', this._onKey);
    }

    private _syncPh = () => {
        if (!this._input) return;
        const text = this._phSlot?.assignedNodes({ flatten: true }).map(n => n.textContent ?? '').join('').trim();
        this._input.placeholder = text || 'Search documentation...';
    };

    private _onInput = (e: Event) => {
        const value = (e.target as HTMLInputElement).value;
        this.dispatchEvent(new CustomEvent('doc-search', { detail: { value }, bubbles: true, composed: true }));
    };

    private _onKey = (e: KeyboardEvent) => {
        if (this.getAttribute('shortcut') !== 'true') return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            this._input?.focus();
        }
    };
}
