import { Component } from "../../../../base/Component";
import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class LateralMenuItem extends Component {
    private _anchor: HTMLAnchorElement | null;
    private _badgeEl: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._anchor = this.shadowRoot?.querySelector('a') ?? null;
        this._badgeEl = this.shadowRoot?.getElementById('badge-element') ?? null;
    }

    static get observedAttributes(): string[] {
        return ['href', 'badge', 'disabled'];
    }

    override connectedCallback(): void {
        for (const prop of ['href', 'badge', 'disabled']) {
            this._upgradeProperty(prop);
        }

        if (!this.hasAttribute('role')) this.setAttribute('role', 'listitem');
        if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');

        this._updateHref(this.getAttribute('href'));
        this._updateBadge(this.getAttribute('badge'));
        this._checkActiveState();

        window.addEventListener('popstate', this._checkActiveState);
        this.addEventListener('keydown', this._handleKeydown);
    }

    disconnectedCallback(): void {
        window.removeEventListener('popstate', this._checkActiveState);
        this.removeEventListener('keydown', this._handleKeydown);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null): void {
        if (!this._anchor) return;
        if (name === 'href') this._updateHref(newVal);
        if (name === 'badge') this._updateBadge(newVal);
        if (name === 'disabled') {
            const isDisabled = this.hasAttribute('disabled');
            this.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
            if (isDisabled) this.setAttribute('tabindex', '-1');
            else this.setAttribute('tabindex', '0');
        }
    }

    get href(): string | null {
        return this.getAttribute('href');
    }

    set href(val: string | null) {
        if (val == null) this.removeAttribute('href');
        else this.setAttribute('href', val);
    }

    get badge(): string | null {
        return this.getAttribute('badge');
    }

    set badge(val: string | null) {
        if (val == null) this.removeAttribute('badge');
        else this.setAttribute('badge', val);
    }

    get disabled(): boolean {
        return this.hasAttribute('disabled');
    }

    set disabled(val: boolean) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    private _upgradeProperty(prop: string): void {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    private _updateHref(value: string | null): void {
        if (!this._anchor) return;
        if (value) this._anchor.setAttribute('href', value);
        else this._anchor.removeAttribute('href');
    }

    private _updateBadge(value: string | null): void {
        if (!this._badgeEl) return;
        if (value) {
            this._badgeEl.textContent = value;
            this._badgeEl.style.display = 'inline-flex';
        } else {
            this._badgeEl.textContent = '';
            this._badgeEl.style.display = 'none';
        }
    }

    /** Compares the item's href with the current URL to determine active state. */
    private _checkActiveState = (): void => {
        if (!this._anchor || !this.hasAttribute('href')) return;

        const hrefAttr = this.getAttribute('href');
        if (!hrefAttr) return;

        try {
            const resolvedURL = new URL(hrefAttr, window.location.href);
            const currentURL = new URL(window.location.href);

            const currentPath = currentURL.pathname;
            const targetPath = resolvedURL.pathname;
            const isActive = targetPath === '/'
                ? currentPath === '/'
                : currentPath === targetPath || currentPath.startsWith(targetPath + '/');

            if (isActive) {
                this.setAttribute('active', '');
                this.setAttribute('aria-current', 'page');
                this._anchor.classList.add('active');
            } else {
                this.removeAttribute('active');
                this.removeAttribute('aria-current');
                this._anchor.classList.remove('active');
            }
        } catch {
            console.warn('Invalid href in LateralMenuItem:', hrefAttr);
        }
    };

    private _handleKeydown = (e: KeyboardEvent): void => {
        if (this.hasAttribute('disabled')) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target !== this) return;

        e.preventDefault();
        this._anchor?.click();
    };
}

if (!customElements.get("w13c-lateral-menu-item")) {
    customElements.define("w13c-lateral-menu-item", LateralMenuItem);
}
