import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class TableRow extends Component {
    static get observedAttributes() {
        return ['href'];
    }

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback() {
        for (const prop of ['href', 'target']) {
            this._upgradeProperty(prop);
        }

        this.addEventListener('click', this._handleClick);
        this.addEventListener('keydown', this._handleKeydown);
        this._syncLinkA11y();
    }

    disconnectedCallback() {
        this.removeEventListener('click', this._handleClick);
        this.removeEventListener('keydown', this._handleKeydown);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === 'href') this._syncLinkA11y();
    }

    private _syncLinkA11y() {
        if (this.hasAttribute('href')) {
            if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
            if (!this.hasAttribute('role')) this.setAttribute('role', 'link');
        } else {
            if (this.getAttribute('role') === 'link') this.removeAttribute('role');
            if (this.getAttribute('tabindex') === '0') this.removeAttribute('tabindex');
            if (!this.hasAttribute('role')) this.setAttribute('role', 'row');
        }
    }

    private _navigate() {
        const href = this.getAttribute('href');
        if (!href) return;
        const target = this.getAttribute('target');

        const detail = { href, target };
        const event = new CustomEvent('p9r-row-click', {
            detail,
            bubbles: true,
            composed: true,
            cancelable: true,
        });
        const proceed = this.dispatchEvent(event);
        if (!proceed) return;

        if (target === '_blank') {
            window.open(href, '_blank', 'noopener,noreferrer');
        } else {
            window.location.href = href;
        }
    }

    private _handleClick = (_e: Event) => {
        if (!this.hasAttribute('href')) return;
        this._navigate();
    };

    private _handleKeydown = (e: KeyboardEvent) => {
        if (!this.hasAttribute('href')) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._navigate();
        }
    };

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    get href() {
        return this.getAttribute('href');
    }

    set href(val: string | null) {
        if (val === null) this.removeAttribute('href');
        else this.setAttribute('href', val);
    }

    get target() {
        return this.getAttribute('target');
    }

    set target(val: string | null) {
        if (val === null) this.removeAttribute('target');
        else this.setAttribute('target', val);
    }
}

if (!customElements.get("p9r-row")) {
    customElements.define("p9r-row", TableRow);
}
