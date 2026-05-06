import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    private _controlSlot: HTMLSlotElement | null = null;
    private _onInvalid = (e: Event) => {
        e.preventDefault();
        this.setAttribute('invalid', '');
    };
    private _onInput = () => {
        if (this.hasAttribute('invalid')) this.removeAttribute('invalid');
    };

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._controlSlot = this.shadowRoot!.querySelector('slot[name="control"]');
        this._controlSlot?.addEventListener('slotchange', this._wireSlotted);
        this._wireSlotted();
    }

    disconnectedCallback(): void {
        this._controlSlot?.removeEventListener('slotchange', this._wireSlotted);
        this._removeControlListeners();
    }

    private _wireSlotted = () => {
        this._removeControlListeners();
        const controls = this._controls();
        controls.forEach(el => {
            el.addEventListener('invalid', this._onInvalid, true);
            el.addEventListener('input', this._onInput, true);
            el.addEventListener('change', this._onInput, true);
        });
    };

    private _removeControlListeners() {
        this._controls().forEach(el => {
            el.removeEventListener('invalid', this._onInvalid, true);
            el.removeEventListener('input', this._onInput, true);
            el.removeEventListener('change', this._onInput, true);
        });
    }

    private _controls(): HTMLElement[] {
        const nodes = this._controlSlot?.assignedElements({ flatten: true }) ?? [];
        return nodes.filter((n): n is HTMLElement => n instanceof HTMLElement);
    }
}
