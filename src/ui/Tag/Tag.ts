import { Component } from "../../base/Component";

import html from './Tag.template.html' with { type: 'text' };
import css from './Tag.style.css' with { type: 'text' };

export class Tag extends Component {

    private _removeBtn: HTMLButtonElement | null;

    static get observedAttributes() {
        return ['removable'];
    }

    constructor() {
        super({
            css: css,
            template: html as unknown as string,
        });
        this._removeBtn = this.shadowRoot?.querySelector<HTMLButtonElement>('.remove') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['removable']) {
            this._upgradeProperty(prop);
        }

        this._syncRemovable();
        this._removeBtn?.addEventListener('click', this._handleRemoveClick);
    }

    disconnectedCallback() {
        this._removeBtn?.removeEventListener('click', this._handleRemoveClick);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (!this._removeBtn) return;
        if (name === 'removable') this._syncRemovable();
    }

    private _syncRemovable() {
        if (!this._removeBtn) return;
        this._removeBtn.hidden = !this.hasAttribute('removable');
    }

    private _handleRemoveClick = (e: Event) => {
        e.stopPropagation();
        const cancelled = !this.dispatchEvent(new CustomEvent('remove', {
            bubbles: true,
            cancelable: true,
            detail: { value: this.getAttribute('value') ?? this.textContent?.trim() ?? '' },
        }));
        if (cancelled) return;
        this.remove();
    };

    private _upgradeProperty(prop: string) {
        if (this.hasOwnProperty(prop)) {
            let value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    get removable() {
        return this.hasAttribute('removable');
    }

    set removable(val: boolean) {
        if (val) this.setAttribute('removable', '');
        else this.removeAttribute('removable');
    }
}

if (!customElements.get("p9r-tag")) {
    customElements.define("p9r-tag", Tag);
}
