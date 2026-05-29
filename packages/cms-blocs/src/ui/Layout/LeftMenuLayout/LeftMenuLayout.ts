import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class LeftMenuLayout extends Component {
    private _sidebar: HTMLElement | null;
    private _content: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._sidebar = this.shadowRoot?.querySelector('.app-sidebar') ?? null;
        this._content = this.shadowRoot?.querySelector('.app-content') ?? null;
    }

    static get observedAttributes() {
        return ['collapsed'];
    }

    override connectedCallback() {
        for (const prop of ['collapsed']) {
            this._upgradeProperty(prop);
        }

        this._syncAriaState();
    }

    disconnectedCallback() {
        // no instance listeners bound today; keep hook for symmetry with addEventListener pairs
    }

    private _upgradeProperty(prop: string) {
        if (this.hasOwnProperty(prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
        if (!this._sidebar) return;
        if (oldVal === newVal) return;

        if (name === 'collapsed') {
            this._syncAriaState();
            this.dispatchEvent(new CustomEvent('w13c-left-menu-collapse', {
                bubbles: true,
                composed: true,
                detail: { collapsed: newVal !== null },
            }));
        }
    }

    private _syncAriaState() {
        if (!this._sidebar) return;
        const isCollapsed = this.hasAttribute('collapsed');
        this._sidebar.setAttribute('aria-expanded', String(!isCollapsed));
        this._sidebar.setAttribute('aria-hidden', String(isCollapsed));
    }

    get collapsed(): boolean {
        return this.hasAttribute('collapsed');
    }

    set collapsed(val: boolean) {
        if (val) this.setAttribute('collapsed', '');
        else this.removeAttribute('collapsed');
    }

    toggle() {
        this.collapsed = !this.collapsed;
    }

    focusContent() {
        this._content?.focus();
    }
}

if (!customElements.get("w13c-left-menu-layout")) {
    customElements.define("w13c-left-menu-layout", LeftMenuLayout);
}
