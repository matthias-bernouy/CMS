import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

const ATTR_MIRROR = ['required', 'disabled', 'multiple', 'autofocus'];

export class Bloc extends Component {

    static observedAttributes = [...ATTR_MIRROR, 'value'];

    private _select: HTMLSelectElement | null = null;
    private _slotName: HTMLSlotElement | null = null;
    private _observer: MutationObserver | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._select = root.querySelector('select') as HTMLSelectElement;
        this._slotName = root.querySelector('slot[name="field-name"]');
        if (!this._select) return;

        this._slotName?.addEventListener('slotchange', this._syncName);

        this._observer = new MutationObserver(this._rebuild);
        this._observer.observe(this, { childList: true, subtree: true, attributes: true, characterData: true });

        this._select.addEventListener('change', this._onChange);

        this._rebuild();
        this._syncName();
        this._syncAttrs();
    }

    disconnectedCallback(): void {
        this._slotName?.removeEventListener('slotchange', this._syncName);
        this._observer?.disconnect();
        this._select?.removeEventListener('change', this._onChange);
    }

    attributeChangedCallback(name: string) {
        if (!this._select) return;
        if (name === 'value') {
            const v = this.getAttribute('value') ?? '';
            if (this._select.value !== v) this._select.value = v;
        } else {
            this._syncAttrs();
        }
    }

    get value(): string { return this._select?.value ?? ''; }
    set value(v: string) {
        if (this._select) this._select.value = v;
        if (v === '') this.removeAttribute('value');
        else this.setAttribute('value', v);
    }

    get name(): string { return this.getAttribute('name') ?? ''; }

    private _rebuild = () => {
        if (!this._select) return;
        const options = Array.from(this.querySelectorAll(':scope > hub-select-option')) as HTMLElement[];
        const prev = this._select.value;
        this._select.innerHTML = '';
        options.forEach(opt => {
            const native = document.createElement('option');
            native.value = opt.getAttribute('value') ?? opt.textContent?.trim() ?? '';
            native.textContent = opt.textContent?.trim() ?? '';
            if (opt.hasAttribute('selected')) native.selected = true;
            if (opt.hasAttribute('disabled')) native.disabled = true;
            this._select!.appendChild(native);
        });
        const hostValue = this.getAttribute('value');
        if (hostValue != null && Array.from(this._select.options).some(o => o.value === hostValue)) {
            this._select.value = hostValue;
        } else if (prev && Array.from(this._select.options).some(o => o.value === prev)) {
            this._select.value = prev;
        }
    };

    private _syncName = () => {
        if (!this._select || !this._slotName) return;
        const name = this._slotName.assignedNodes({ flatten: true })
            .map(n => (n as Node).textContent ?? '')
            .join('')
            .trim();
        if (name) { this._select.name = name; this.setAttribute('name', name); }
        else { this._select.removeAttribute('name'); this.removeAttribute('name'); }
    };

    private _syncAttrs() {
        if (!this._select) return;
        for (const a of ATTR_MIRROR) {
            const v = this.getAttribute(a);
            if (v == null) this._select.removeAttribute(a);
            else this._select.setAttribute(a, v);
        }
    }

    private _onChange = () => {
        const v = this._select?.value ?? '';
        if (v === '') this.removeAttribute('value');
        else this.setAttribute('value', v);
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    };
}
