import { Component } from "@bernouy/cms-blocs/base";
import "./LateralMenuItem/LateralMenuItem";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import { upgradeProperty } from './compute';
import { handleKeydown } from './listener';

export class LateralMenu extends Component {
    private _sidebar: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._sidebar = this.shadowRoot?.querySelector('.sidebar') ?? null;
    }

    static get observedAttributes(): string[] {
        return ['collapsed'];
    }

    override connectedCallback(): void {
        upgradeProperty(this, 'collapsed');
        if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'Main navigation');
        this.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback(): void {
        this.removeEventListener('keydown', this._onKey);
    }

    attributeChangedCallback(name: string): void {
        if (!this._sidebar) return;
        if (name === 'collapsed') {
            this._sidebar.classList.toggle('collapsed', this.hasAttribute('collapsed'));
        }
    }

    toggle(): void { this.collapsed = !this.collapsed; }

    get collapsed(): boolean { return this.hasAttribute('collapsed'); }
    set collapsed(val: boolean) {
        if (val) this.setAttribute('collapsed', '');
        else this.removeAttribute('collapsed');
    }

    private _onKey = (e: KeyboardEvent) => handleKeydown(this, e);
}

if (!customElements.get("w13c-lateral-menu")) {
    customElements.define("w13c-lateral-menu", LateralMenu);
}
