import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

const ATTR_MIRROR = ['required', 'disabled', 'autofocus', 'name'];

export class Bloc extends Component {

    static observedAttributes = [...ATTR_MIRROR, 'checked', 'value'];

    private _input: HTMLInputElement | null = null;
    private _slotValue: HTMLSlotElement | null = null;
    private _slotLabel: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._input = root.querySelector('input') as HTMLInputElement;
        this._slotValue = root.querySelector('slot[name="field-value"]');
        this._slotLabel = root.querySelector('slot:not([name])');
        if (!this._input) return;

        this._slotValue?.addEventListener('slotchange', this._syncValue);
        this._slotLabel?.addEventListener('slotchange', this._syncValue);
        this._input.addEventListener('change', this._onChange);

        this._syncValue();
        this._syncAttrs();
        this._syncChecked();
    }

    disconnectedCallback(): void {
        this._slotValue?.removeEventListener('slotchange', this._syncValue);
        this._slotLabel?.removeEventListener('slotchange', this._syncValue);
        this._input?.removeEventListener('change', this._onChange);
    }

    attributeChangedCallback(name: string) {
        if (!this._input) return;
        if (name === 'checked') this._syncChecked();
        else this._syncAttrs();
    }

    get checked(): boolean { return !!this._input?.checked; }
    set checked(v: boolean) {
        if (this._input) this._input.checked = v;
        if (v) this.setAttribute('checked', '');
        else this.removeAttribute('checked');
    }

    get name(): string { return this.getAttribute('name') ?? ''; }
    get value(): string { return this._input?.value ?? ''; }

    private _syncValue = () => {
        if (!this._input) return;
        const explicit = this._readSlot(this._slotValue);
        const label = this._readSlot(this._slotLabel);
        this._input.value = explicit || label;
    };

    private _readSlot(slot: HTMLSlotElement | null): string {
        if (!slot) return '';
        return slot.assignedNodes({ flatten: true })
            .map(n => (n as Node).textContent ?? '')
            .join('')
            .trim();
    }

    private _syncAttrs() {
        if (!this._input) return;
        for (const a of ATTR_MIRROR) {
            const v = this.getAttribute(a);
            if (v == null) this._input.removeAttribute(a);
            else this._input.setAttribute(a, v);
        }
    }

    private _syncChecked() {
        if (!this._input) return;
        this._input.checked = this.hasAttribute('checked');
    }

    private _onChange = () => {
        if (!this._input) return;
        if (this._input.checked) this.setAttribute('checked', '');
        else this.removeAttribute('checked');
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    };
}
