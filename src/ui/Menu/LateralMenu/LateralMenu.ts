import { Component } from "../../../base/Component";
import "./LateralMenuItem/LateralMenuItem";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class LateralMenu extends Component {
    private _sidebar: HTMLElement | null;
    private _navSlot: HTMLSlotElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._sidebar = this.shadowRoot?.querySelector('.sidebar') ?? null;
        this._navSlot = this.shadowRoot?.querySelector('slot:not([name])') ?? null;
    }

    static get observedAttributes(): string[] {
        return ['collapsed'];
    }

    override connectedCallback(): void {
        for (const prop of ['collapsed']) {
            this._upgradeProperty(prop);
        }

        if (!this.hasAttribute('aria-label')) {
            this.setAttribute('aria-label', 'Main navigation');
        }

        this.addEventListener('keydown', this._handleKeydown);
    }

    disconnectedCallback(): void {
        this.removeEventListener('keydown', this._handleKeydown);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null): void {
        if (!this._sidebar) return;
        if (name === 'collapsed') {
            this._sidebar.classList.toggle('collapsed', this.hasAttribute('collapsed'));
        }
    }

    toggle(): void {
        this.collapsed = !this.collapsed;
    }

    get collapsed(): boolean {
        return this.hasAttribute('collapsed');
    }

    set collapsed(val: boolean) {
        if (val) this.setAttribute('collapsed', '');
        else this.removeAttribute('collapsed');
    }

    private _upgradeProperty(prop: string): void {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    private _getItems(): HTMLElement[] {
        if (!this._navSlot) return [];
        return this._navSlot
            .assignedElements({ flatten: true })
            .filter((el): el is HTMLElement =>
                el instanceof HTMLElement &&
                el.tagName.toLowerCase() === 'w13c-lateral-menu-item' &&
                !el.hasAttribute('disabled')
            );
    }

    private _handleKeydown = (e: KeyboardEvent): void => {
        const items = this._getItems();
        if (items.length === 0) return;

        const active = document.activeElement;
        const currentIndex = items.findIndex(item => item === active || item.contains(active));

        let nextIndex = -1;
        switch (e.key) {
            case 'ArrowDown':
                nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
                break;
            case 'ArrowUp':
                nextIndex = currentIndex < 0
                    ? items.length - 1
                    : (currentIndex - 1 + items.length) % items.length;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = items.length - 1;
                break;
            default:
                return;
        }

        e.preventDefault();
        const target = items[nextIndex];
        if (target) target.focus();
    };
}

if (!customElements.get("w13c-lateral-menu")) {
    customElements.define("w13c-lateral-menu", LateralMenu);
}
