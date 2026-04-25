import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Step extends Component {

    private _label: HTMLElement | null;
    private _number: HTMLElement | null;

    static get observedAttributes() {
        return ['label', 'data-index'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._label = this.shadowRoot?.querySelector('.label') ?? null;
        this._number = this.shadowRoot?.querySelector('.number') ?? null;
    }

    override connectedCallback() {
        this._sync();
    }

    attributeChangedCallback(_name: string, _oldVal: string | null, _newVal: string | null) {
        this._sync();
    }

    private _sync() {
        if (this._label) this._label.textContent = this.getAttribute('label') ?? '';
        if (this._number) this._number.textContent = this.getAttribute('data-index') ?? '';
    }
}

if (!customElements.get("p9r-step")) {
    customElements.define("p9r-step", Step);
}
