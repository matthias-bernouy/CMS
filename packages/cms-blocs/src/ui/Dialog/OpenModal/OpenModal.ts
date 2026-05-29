import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class OpenModal extends Component {

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback() {
        if (!this.hasAttribute('role')) this.setAttribute('role', 'button');
        if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
        this.addEventListener('click', this._open);
        this.addEventListener('keydown', this._handleKeydown);
    }

    disconnectedCallback() {
        this.removeEventListener('click', this._open);
        this.removeEventListener('keydown', this._handleKeydown);
    }

    private _handleKeydown = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        this._open();
    };

    private _open = () => {
        const targetId = this.getAttribute('modal-target');
        if (!targetId) return;
        const root = (this.getRootNode() as Document | ShadowRoot);
        const modal = root.getElementById
            ? root.getElementById(targetId)
            : (root as ShadowRoot).querySelector(`#${CSS.escape(targetId)}`);
        if (!modal) return;
        if (typeof (modal as unknown as { show?: () => void }).show === 'function') {
            (modal as unknown as { show: () => void }).show();
        } else {
            modal.setAttribute('open', '');
        }
    };

    get modalTarget(): string { return this.getAttribute('modal-target') ?? ''; }
    set modalTarget(val: string) {
        if (val) this.setAttribute('modal-target', val);
        else this.removeAttribute('modal-target');
    }
}

if (!customElements.get('p9r-open-modal')) {
    customElements.define('p9r-open-modal', OpenModal);
}
