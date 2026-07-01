import { Component, upgradeProperty } from "@bernouy/components/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class LeftMenuLayout extends Component {
    private _sidebar: HTMLElement | null;
    private _secondarySidebar: HTMLElement | null;
    private _secondarySlot: HTMLSlotElement | null;
    private _content: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._sidebar = this.shadowRoot?.querySelector('.app-sidebar') ?? null;
        this._secondarySidebar = this.shadowRoot?.querySelector('.secondary-sidebar') ?? null;
        this._secondarySlot = this.shadowRoot?.querySelector('slot[name="secondary-sidebar"]') ?? null;
        this._content = this.shadowRoot?.querySelector('.app-content') ?? null;
    }

    static get observedAttributes() {
        return ['collapsed'];
    }

    override connectedCallback() {
        for (const prop of ['collapsed']) {
            upgradeProperty(this, prop);
        }

        this._syncAriaState();
        this._syncSecondarySidebar();
        this._secondarySlot?.addEventListener('slotchange', this._onSecondarySlotChange);
    }

    disconnectedCallback() {
        this._secondarySlot?.removeEventListener('slotchange', this._onSecondarySlotChange);
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

    private _syncSecondarySidebar() {
        if (!this._secondarySidebar || !this._secondarySlot) return;
        const hasSecondaryNavigation = this._secondarySlot
            .assignedElements({ flatten: true })
            .some(element => element instanceof HTMLElement && !element.hidden);
        this._secondarySidebar.hidden = !hasSecondaryNavigation;
    }

    private _onSecondarySlotChange = () => this._syncSecondarySidebar();

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
