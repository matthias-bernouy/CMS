import { Component, upgradeProperty } from "@bernouy/cms-blocs/base";

import html from './Tag.template.html' with { type: 'text' };
import baseCss from './Tag.base.css' with { type: 'text' };
import variantCss from './Tag.variant.css' with { type: 'text' };
const css = baseCss + variantCss;

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
            upgradeProperty(this, prop);
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

    get removable() {
        return this.hasAttribute('removable');
    }

    set removable(val: boolean) {
        if (val) this.setAttribute('removable', '');
        else this.removeAttribute('removable');
    }
}
