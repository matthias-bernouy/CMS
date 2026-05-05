import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import baseCss from './base.css' with { type: 'text' };
import variantCss from './variant.css' with { type: 'text' };
const css = baseCss + variantCss;

export type ToastType = "success" | "error" | "warning" | "info";

export class Toast extends Component {

    private _timer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback() {
        const closeBtn = this.shadowRoot?.querySelector<HTMLButtonElement>('.close');
        closeBtn?.addEventListener('click', () => this.dismiss());

        const duration = Number(this.getAttribute('duration') ?? 3500);
        if (duration > 0) this._timer = setTimeout(() => this.dismiss(), duration);
    }

    disconnectedCallback() {
        if (this._timer) clearTimeout(this._timer);
    }

    dismiss() {
        if (this.hasAttribute('leaving')) return;
        this.setAttribute('leaving', '');
        if (this._timer) clearTimeout(this._timer);

        this.addEventListener('animationend', () => {
            this.dispatchEvent(new CustomEvent('toast-dismissed', { bubbles: true }));
            this.remove();
        }, { once: true });
    }
}

if (!customElements.get("p9r-toast")) {
    customElements.define("p9r-toast", Toast);
}
