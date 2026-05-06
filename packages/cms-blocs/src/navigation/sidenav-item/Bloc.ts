import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    static observedAttributes = ['href', 'target', 'match'];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._trigger = this.shadowRoot?.querySelector('.trigger') as HTMLAnchorElement | null;

        window.removeEventListener('popstate', this._onNav);
        window.addEventListener('popstate', this._onNav);

        this._syncAnchor();
        this._syncCurrent();
    }

    disconnectedCallback(): void {
        window.removeEventListener('popstate', this._onNav);
        this._trigger = null;
    }

    attributeChangedCallback(): void {
        this._syncAnchor();
        this._syncCurrent();
    }

    private _trigger: HTMLAnchorElement | null = null;

    private _onNav = () => {
        this._syncCurrent();
    }

    private _syncAnchor(): void {
        if (!this._trigger) return;
        const href = this.getAttribute('href');
        const target = this.getAttribute('target');
        if (href) this._trigger.setAttribute('href', href);
        else this._trigger.removeAttribute('href');
        if (target) this._trigger.setAttribute('target', target);
        else this._trigger.removeAttribute('target');
    }

    private _syncCurrent(): void {
        if (!this._trigger) return;
        const isCurrent = this._isCurrent();
        if (isCurrent) {
            this._trigger.setAttribute('aria-current', 'page');
        } else {
            this._trigger.removeAttribute('aria-current');
        }
    }

    // Compares the item's href (resolved against the current origin) to
    // `location.pathname`. External links never match. Root path `/` only
    // matches exactly — otherwise every item linking to `/` would stay
    // active on every page.
    private _isCurrent(): boolean {
        const href = this.getAttribute('href');
        if (!href) return false;

        let url: URL;
        try { url = new URL(href, location.href); }
        catch { return false; }

        if (url.origin !== location.origin) return false;

        const itemPath = this._normalize(url.pathname);
        const currentPath = this._normalize(location.pathname);
        const mode = this.getAttribute('match') || 'exact';

        if (itemPath === currentPath) return true;
        if (mode === 'prefix' && itemPath !== '/') {
            return currentPath.startsWith(itemPath + '/');
        }
        return false;
    }

    private _normalize(path: string): string {
        if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
        return path;
    }

}
