import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Divider extends Component {

    private _label: HTMLElement | null;
    private _labelSlot: HTMLSlotElement | null;

    static get observedAttributes() {
        return ['orientation'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._label = this.shadowRoot?.querySelector('.label') ?? null;
        this._labelSlot = this.shadowRoot?.querySelector('.label slot') ?? null;
    }

    override connectedCallback() {
        this._syncAria();
        this._labelSlot?.addEventListener('slotchange', this._syncLabel);
        this._syncLabel();
    }

    disconnectedCallback() {
        this._labelSlot?.removeEventListener('slotchange', this._syncLabel);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === 'orientation') this._syncAria();
    }

    /** Hide the label only when nothing is slotted — CSS `:empty`/`:has` on a
     *  `<slot>` ignores assigned content (see Checkbox). */
    private _syncLabel = () => {
        if (!this._label || !this._labelSlot) return;
        const hasContent = this._labelSlot.assignedNodes({ flatten: true })
            .some(n => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? '').trim() !== '');
        this._label.classList.toggle('is-empty', !hasContent);
    };

    private _syncAria() {
        const orientation = this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal';
        this.setAttribute('aria-orientation', orientation);
    }
}
