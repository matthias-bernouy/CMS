import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    static observedAttributes = ['required', 'disabled'];

    private _slotName: HTMLSlotElement | null = null;
    private _observer: MutationObserver | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._slotName = root.querySelector('slot[name="field-name"]');

        this._slotName?.addEventListener('slotchange', this._syncName);

        this._observer = new MutationObserver(this._propagate);
        this._observer.observe(this, { childList: true, subtree: true });

        this._syncName();
        this._propagate();
    }

    disconnectedCallback(): void {
        this._slotName?.removeEventListener('slotchange', this._syncName);
        this._observer?.disconnect();
    }

    attributeChangedCallback() {
        this._propagate();
    }

    get name(): string { return this.getAttribute('name') ?? ''; }

    private _syncName = () => {
        if (!this._slotName) return;
        const name = this._slotName.assignedNodes({ flatten: true })
            .map(n => (n as Node).textContent ?? '')
            .join('')
            .trim();
        if (name) this.setAttribute('name', name);
        else this.removeAttribute('name');
        this._propagate();
    };

    private _propagate = () => {
        const name = this.getAttribute('name') ?? '';
        const required = this.hasAttribute('required');
        const disabled = this.hasAttribute('disabled');
        const radios = this.querySelectorAll(':scope > base-radio') as NodeListOf<HTMLElement>;
        radios.forEach((r, i) => {
            if (name) r.setAttribute('name', name);
            else r.removeAttribute('name');
            if (required && i === 0) r.setAttribute('required', '');
            else r.removeAttribute('required');
            if (disabled) r.setAttribute('disabled', '');
        });
    };
}
