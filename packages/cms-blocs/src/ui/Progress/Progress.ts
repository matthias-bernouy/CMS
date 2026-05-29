import { Component } from "../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Progress extends Component {

    private _bar: HTMLElement | null;
    private _label: HTMLElement | null;
    private _root: HTMLElement | null;

    static get observedAttributes() {
        return ['value', 'max', 'indeterminate'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._bar = this.shadowRoot?.querySelector('.bar') ?? null;
        this._label = this.shadowRoot?.querySelector('.label') ?? null;
        this._root = this.shadowRoot?.querySelector('.progress') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['value', 'max']) this._upgradeProperty(prop);
        this._sync();
    }

    attributeChangedCallback(_name: string, _oldVal: string | null, _newVal: string | null) {
        this._sync();
    }

    private _sync() {
        const indeterminate = this.hasAttribute('indeterminate');
        const max = this._parseNumber(this.getAttribute('max'), 100);
        const value = this._parseNumber(this.getAttribute('value'), 0);
        const clamped = Math.max(0, Math.min(value, max));
        const pct = max > 0 ? (clamped / max) * 100 : 0;

        if (indeterminate) {
            this._root?.removeAttribute('aria-valuenow');
            this._root?.setAttribute('aria-valuemin', '0');
            this._root?.setAttribute('aria-valuemax', '100');
        } else {
            this._root?.setAttribute('aria-valuenow', String(clamped));
            this._root?.setAttribute('aria-valuemin', '0');
            this._root?.setAttribute('aria-valuemax', String(max));
            this.style.setProperty('--_value', `${pct}%`);
        }

        if (this._label) {
            this._label.dataset.valueText = `${Math.round(pct)}%`;
        }
    }

    private _parseNumber(raw: string | null, fallback: number): number {
        if (raw === null) return fallback;
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    get value(): number { return this._parseNumber(this.getAttribute('value'), 0); }
    set value(v: number) { this.setAttribute('value', String(v)); }

    get max(): number { return this._parseNumber(this.getAttribute('max'), 100); }
    set max(v: number) { this.setAttribute('max', String(v)); }

    get indeterminate(): boolean { return this.hasAttribute('indeterminate'); }
    set indeterminate(v: boolean) {
        if (v) this.setAttribute('indeterminate', '');
        else this.removeAttribute('indeterminate');
    }
}

if (!customElements.get("p9r-progress")) {
    customElements.define("p9r-progress", Progress);
}
