import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

const ATTR_MIRROR = [
    'required', 'disabled', 'readonly', 'autofocus', 'autocomplete',
    'min', 'max', 'step', 'minlength', 'maxlength', 'multiple', 'inputmode', 'spellcheck',
];

export class Bloc extends Component {

    static observedAttributes = [...ATTR_MIRROR, 'value'];

    private _input: HTMLInputElement | null = null;
    private _slotName: HTMLSlotElement | null = null;
    private _slotPlaceholder: HTMLSlotElement | null = null;
    private _slotValue: HTMLSlotElement | null = null;
    private _slotPattern: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._input = root.querySelector('input') as HTMLInputElement;
        if (!this._input) return;
        this._input.type = 'text';

        this._slotName = root.querySelector('slot[name="field-name"]');
        this._slotPlaceholder = root.querySelector('slot[name="placeholder"]');
        this._slotValue = root.querySelector('slot[name="default-value"]');
        this._slotPattern = root.querySelector('slot[name="pattern"]');

        this._slotName?.addEventListener('slotchange', this._syncFromSlots);
        this._slotPlaceholder?.addEventListener('slotchange', this._syncFromSlots);
        this._slotValue?.addEventListener('slotchange', this._syncFromSlots);
        this._slotPattern?.addEventListener('slotchange', this._syncFromSlots);

        this._syncFromSlots();
        this._syncAttrs();

        this._input.addEventListener('input', this._onInput);
        this._input.addEventListener('change', this._onChange);
    }

    disconnectedCallback(): void {
        this._slotName?.removeEventListener('slotchange', this._syncFromSlots);
        this._slotPlaceholder?.removeEventListener('slotchange', this._syncFromSlots);
        this._slotValue?.removeEventListener('slotchange', this._syncFromSlots);
        this._slotPattern?.removeEventListener('slotchange', this._syncFromSlots);
        this._input?.removeEventListener('input', this._onInput);
        this._input?.removeEventListener('change', this._onChange);
    }

    attributeChangedCallback(name: string) {
        if (!this._input) return;
        if (name === 'value') {
            const v = this.getAttribute('value');
            if (v != null && this._input.value !== v) this._input.value = v;
        } else {
            this._syncAttrs();
        }
    }

    get value(): string { return this._input?.value ?? ''; }
    set value(v: string) {
        if (this._input) this._input.value = v;
        if (v === '') this.removeAttribute('value');
        else this.setAttribute('value', v);
    }

    get name(): string { return this._readSlot(this._slotName); }

    private _syncFromSlots = () => {
        if (!this._input) return;
        const name = this._readSlot(this._slotName);
        const ph = this._readSlot(this._slotPlaceholder);
        const pat = this._readSlot(this._slotPattern);
        const defVal = this._readSlot(this._slotValue);

        if (name) { this._input.name = name; this.setAttribute('name', name); }
        else { this._input.removeAttribute('name'); this.removeAttribute('name'); }

        if (ph) this._input.placeholder = ph; else this._input.removeAttribute('placeholder');
        if (pat) this._input.setAttribute('pattern', pat); else this._input.removeAttribute('pattern');

        if (!this.hasAttribute('value') && defVal) this._input.value = defVal;
    };

    private _syncAttrs() {
        if (!this._input) return;
        for (const a of ATTR_MIRROR) {
            const v = this.getAttribute(a);
            if (v == null) this._input.removeAttribute(a);
            else this._input.setAttribute(a, v);
        }
    }

    private _readSlot(slot: HTMLSlotElement | null): string {
        if (!slot) return '';
        return slot.assignedNodes({ flatten: true })
            .map(n => (n as Node).textContent ?? '')
            .join('')
            .trim();
    }

    private _onInput = () => {
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    };

    private _onChange = () => {
        const v = this._input?.value ?? '';
        if (v === '') this.removeAttribute('value');
        else this.setAttribute('value', v);
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    };
}
