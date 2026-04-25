import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class RadioGroup extends Component {

    static formAssociated = true;
    private _internals: ElementInternals;
    private _label: HTMLElement | null;
    private _slot: HTMLSlotElement | null;

    static get observedAttributes() {
        return ['value', 'label', 'name', 'disabled'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._internals = this.attachInternals();
        this._label = this.shadowRoot?.querySelector('.label') ?? null;
        this._slot = this.shadowRoot?.querySelector('slot') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['value', 'name', 'disabled']) this._upgradeProperty(prop);

        this.setAttribute('role', 'radiogroup');
        this._syncLabel();
        this._slot?.addEventListener('slotchange', this._syncRadios);
        this.addEventListener('change', this._onRadioChange);
        this.addEventListener('keydown', this._onKeydown);
        this._syncRadios();
    }

    disconnectedCallback() {
        this._slot?.removeEventListener('slotchange', this._syncRadios);
        this.removeEventListener('change', this._onRadioChange);
        this.removeEventListener('keydown', this._onKeydown);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (name === 'value') this._applyValue(newVal);
        else if (name === 'label') this._syncLabel();
        else if (name === 'disabled') this._syncDisabled();
    }

    get value(): string { return this.getAttribute('value') ?? ''; }
    set value(v: string) { this.setAttribute('value', v); }

    get name(): string { return this.getAttribute('name') ?? ''; }
    set name(v: string) {
        if (v) this.setAttribute('name', v);
        else this.removeAttribute('name');
    }

    get disabled(): boolean { return this.hasAttribute('disabled'); }
    set disabled(v: boolean) {
        if (v) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    private _radios(): HTMLElement[] {
        if (!this._slot) return [];
        return this._slot.assignedElements({ flatten: true })
            .filter(el => el.tagName === 'P9R-RADIO') as HTMLElement[];
    }

    private _syncRadios = () => {
        const radios = this._radios();
        const groupName = this.getAttribute('name') ?? `radiogroup-${RadioGroup._uid++}`;
        const value = this.getAttribute('value');

        radios.forEach(r => {
            r.setAttribute('name', groupName);
            const isSelected = value !== null && r.getAttribute('value') === value;
            if (isSelected) r.setAttribute('checked', '');
            else r.removeAttribute('checked');
            r.setAttribute('tabindex', isSelected ? '0' : '-1');
        });

        // If no radio matches but we have radios, fall back to first as tab stop
        if (value === null && radios.length > 0) {
            radios[0]?.setAttribute('tabindex', '0');
        }

        this._syncDisabled();
        this._internals.setFormValue(value ?? null);
    };

    private _onRadioChange = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'P9R-RADIO') return;
        const newValue = target.getAttribute('value') ?? '';
        if (newValue !== this.getAttribute('value')) {
            this.setAttribute('value', newValue);
            this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: newValue } }));
        }
    };

    private _onKeydown = (e: KeyboardEvent) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (!keys.includes(e.key)) return;
        const radios = this._radios().filter(r => !r.hasAttribute('disabled'));
        if (radios.length === 0) return;

        const current = radios.findIndex(r => r === document.activeElement);
        const fallback = current === -1 ? 0 : current;
        let nextIdx = fallback;

        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp':   nextIdx = (fallback - 1 + radios.length) % radios.length; break;
            case 'ArrowRight':
            case 'ArrowDown': nextIdx = (fallback + 1) % radios.length; break;
            case 'Home':      nextIdx = 0; break;
            case 'End':       nextIdx = radios.length - 1; break;
        }

        e.preventDefault();
        const next = radios[nextIdx];
        if (!next) return;
        const value = next.getAttribute('value') ?? '';
        this.setAttribute('value', value);
        next.focus();
        this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value } }));
    };

    private _applyValue(value: string | null) {
        const radios = this._radios();
        radios.forEach(r => {
            const selected = value !== null && r.getAttribute('value') === value;
            if (selected) r.setAttribute('checked', '');
            else r.removeAttribute('checked');
            r.setAttribute('tabindex', selected ? '0' : '-1');
        });
        this._internals.setFormValue(value ?? null);
    }

    private _syncLabel() {
        if (!this._label) return;
        this._label.textContent = this.getAttribute('label') ?? '';
    }

    private _syncDisabled() {
        const disabled = this.hasAttribute('disabled');
        this._radios().forEach(r => {
            if (disabled) r.setAttribute('disabled', '');
        });
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    private static _uid = 0;
}

if (!customElements.get("p9r-radio-group")) {
    customElements.define("p9r-radio-group", RadioGroup);
}
