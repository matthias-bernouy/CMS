import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    private _anchor: HTMLElement | null = null;
    private _slot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._anchor = this.shadowRoot?.querySelector('.anchor') ?? null;
        this._slot = this.shadowRoot?.querySelector('slot') ?? null;
        this._slot?.addEventListener('slotchange', this._syncId);
        this._anchor?.addEventListener('click', this._onCopy);
        this._syncId();
    }

    disconnectedCallback(): void {
        this._slot?.removeEventListener('slotchange', this._syncId);
        this._anchor?.removeEventListener('click', this._onCopy);
    }

    private _syncId = () => {
        if (this.id) return;
        const text = this._slot?.assignedNodes({ flatten: true }).map(n => n.textContent ?? '').join('').trim() ?? '';
        this.id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    };

    private _onCopy = async (e: Event) => {
        e.preventDefault();
        const url = `${location.origin}${location.pathname}#${this.id}`;
        try { await navigator.clipboard.writeText(url); } catch {}
        history.replaceState(null, '', `#${this.id}`);
    };
}
