import { Component } from "../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Divider extends Component {

    static get observedAttributes() {
        return ['orientation'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        this._syncAria();
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === 'orientation') this._syncAria();
    }

    private _syncAria() {
        const orientation = this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal';
        this.setAttribute('aria-orientation', orientation);
    }
}

if (!customElements.get("p9r-divider")) {
    customElements.define("p9r-divider", Divider);
}
